import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationsRepository } from './reservations.repository';
import { PAYMENTS_SERVICE, User, observeRpc, withRequestId } from '@app/common';
import { ClientProxy } from '@nestjs/microservices';
import { FindOptionsWhere, QueryFailedError } from 'typeorm';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import { Reservation, ReservationStatus } from './models/reservation.entity';
import { PlacesRepository } from './places/places.repository';
import { nightsForStay } from './booking-rules';

export const ADMIN_ROLE = 'Admin';

// Covers the round trip to Stripe, which can take several seconds.
export const PAYMENTS_TIMEOUT_MS = 15000;

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly reservationRepository: ReservationsRepository,
    private readonly placesRepository: PlacesRepository,
    @Inject(PAYMENTS_SERVICE) private readonly paymentService: ClientProxy,
  ) {}

  /**
   * Books a place: holds the dates as a pending reservation, charges the
   * card, then confirms. Holding first means two customers can never both
   * pay for the same nights.
   *
   * A repeated Idempotency-Key replays the original attempt rather than
   * booking again; see replay().
   */
  async create(
    { placeId, startDate, endDate, paymentMethodId }: CreateReservationDto,
    user: User,
    idempotencyKey?: string,
  ) {
    if (idempotencyKey) {
      const previous = await this.reservationRepository.findOneOrNull({
        userId: user.id,
        idempotencyKey,
      });
      if (previous) {
        return this.replay(previous, paymentMethodId, user);
      }
    }

    const nights = nightsForStay(startDate, endDate);
    const place = await this.placesRepository.findOne({ id: placeId });

    const reservation = await this.hold(
      new Reservation({
        placeId,
        startDate,
        endDate,
        userId: user.id,
        status: ReservationStatus.Pending,
        // Priced by the server. The client used to send the amount, so it
        // could pay whatever it liked.
        amountCents: nights * place.pricePerNightCents,
        idempotencyKey: idempotencyKey ?? null,
      }),
    );

    return this.chargeAndConfirm(reservation, paymentMethodId, user);
  }

  findAll(user: User) {
    return this.reservationRepository.find(this.scopeTo(user));
  }

  findOne(id: number, user: User) {
    return this.reservationRepository.findOne({ ...this.scopeTo(user), id });
  }

  /**
   * Cancels a confirmed reservation before check-in and refunds it in full.
   * The refund is keyed on the reservation, so retrying a cancellation that
   * failed half-way returns the same refund rather than erroring.
   */
  async cancel(id: number, user: User) {
    const reservation = await this.findOne(id, user);

    if (reservation.status !== ReservationStatus.Confirmed) {
      throw new ConflictException(
        `Only confirmed reservations can be cancelled; this one is ${reservation.status}`,
      );
    }
    if (reservation.startDate <= new Date()) {
      throw new BadRequestException(
        'A reservation cannot be cancelled once the stay has started',
      );
    }

    const refund = await this.callPayments<{ id: string }>('refund_charge', {
      paymentIntentId: reservation.invoiceId,
      idempotencyKey: `reservation-${reservation.id}-refund`,
    });

    return this.reservationRepository.findOneAndUpdate(
      { id: reservation.id },
      { status: ReservationStatus.Cancelled, refundId: refund.id },
    );
  }

  remove(id: number, user: User) {
    return this.reservationRepository.findOneAndDelete({
      ...this.scopeTo(user),
      id,
    });
  }

  /**
   * Answers a retried request. A confirmed booking is returned as it is. A
   * pending one is charged again with the same Stripe idempotency key, so if
   * the first charge went through (say, the reply timed out) Stripe returns
   * that charge instead of taking a second payment.
   */
  private async replay(
    previous: Reservation,
    paymentMethodId: string,
    user: User,
  ) {
    switch (previous.status) {
      case ReservationStatus.Confirmed:
        return previous;
      case ReservationStatus.Pending:
        return this.chargeAndConfirm(previous, paymentMethodId, user);
      default:
        throw new ConflictException(
          'This Idempotency-Key belongs to a booking that did not complete; use a new key to try again',
        );
    }
  }

  private async hold(reservation: Reservation) {
    try {
      return await this.reservationRepository.holdIfAvailable(reservation);
    } catch (error) {
      // Two concurrent requests with the same Idempotency-Key: the unique
      // index lets only one through.
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === 'ER_DUP_ENTRY'
      ) {
        throw new ConflictException(
          'A booking with this Idempotency-Key is already in progress',
        );
      }
      throw error;
    }
  }

  private async chargeAndConfirm(
    reservation: Reservation,
    paymentMethodId: string,
    { email }: User,
  ) {
    let paymentIntent: { id: string };
    try {
      paymentIntent = await this.callPayments('create_charge', {
        paymentMethodId,
        amountCents: reservation.amountCents,
        email,
        // Derived from the reservation, so every attempt to pay for this
        // booking is the same charge as far as Stripe is concerned.
        idempotencyKey: `reservation-${reservation.id}-charge`,
      });
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        // A definite refusal (declined card, invalid payment method): free
        // the dates.
        await this.setStatus(reservation.id, ReservationStatus.Failed);
      } else {
        // A timeout or outage: the charge may or may not have happened. The
        // reservation stays pending, holding the dates until its hold expires
        // or the client retries with the same Idempotency-Key.
        this.logger.error(
          `Charge outcome unknown for reservation ${reservation.id}; left pending`,
        );
      }
      throw error;
    }

    try {
      return await this.reservationRepository.findOneAndUpdate(
        { id: reservation.id },
        { status: ReservationStatus.Confirmed, invoiceId: paymentIntent.id },
      );
    } catch (error) {
      // The customer has paid for a booking that could not be confirmed.
      // Undo the charge rather than leave it for support to find.
      this.logger.error(
        `Confirming reservation ${reservation.id} failed after charge ${paymentIntent.id}; refunding`,
        (error as Error)?.stack,
      );
      await this.refundAfterFailure(reservation.id, paymentIntent.id);
      throw new InternalServerErrorException(
        'The reservation could not be saved and the charge has been refunded.',
      );
    }
  }

  /**
   * Restricts a query to the caller's own reservations unless they are an
   * admin. Someone else's reservation therefore surfaces as "not found"
   * rather than "forbidden", which does not confirm that the id exists.
   */
  private scopeTo(user: User): FindOptionsWhere<Reservation> {
    const isAdmin = user.roles?.some((role) => role.name === ADMIN_ROLE);
    return isAdmin ? {} : { userId: user.id };
  }

  private async setStatus(id: number, status: ReservationStatus) {
    try {
      await this.reservationRepository.findOneAndUpdate({ id }, { status });
    } catch (error) {
      // Best effort: a pending row left behind stops blocking once its hold
      // expires.
      this.logger.error(
        `Could not mark reservation ${id} ${status}`,
        (error as Error)?.stack,
      );
    }
  }

  private async refundAfterFailure(
    reservationId: number,
    paymentIntentId: string,
  ) {
    try {
      await this.callPayments('refund_charge', {
        paymentIntentId,
        idempotencyKey: `reservation-${reservationId}-refund`,
      });
    } catch (error) {
      // Logged with the payment intent id so it can be refunded by hand.
      this.logger.error(
        `MANUAL ACTION REQUIRED: refund of ${paymentIntentId} failed`,
        error instanceof Error ? error.stack : JSON.stringify(error),
      );
    }
    await this.setStatus(reservationId, ReservationStatus.Failed);
  }

  private async callPayments<R>(pattern: string, data: object): Promise<R> {
    try {
      return await firstValueFrom(
        this.paymentService
          .send<R>(pattern, withRequestId(data))
          .pipe(timeout(PAYMENTS_TIMEOUT_MS), observeRpc(pattern)),
      );
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  /**
   * Payments replies to failures with `{ status, message }` (an RpcException
   * payload). Those are passed through so that, say, a declined card reaches
   * the client as a 402. Anything else means payments could not be reached.
   */
  private toHttpException(error: any): HttpException {
    if (error instanceof TimeoutError) {
      // The charge may still have gone through, which is what the
      // Idempotency-Key header exists to make safe to retry.
      return new GatewayTimeoutException('The payment service timed out');
    }
    if (typeof error?.status === 'number') {
      return new HttpException(error.message, error.status);
    }
    return new BadGatewayException('The payment service is unavailable');
  }
}
