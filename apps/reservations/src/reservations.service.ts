import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationsRepository } from './reservations.repository';
import { PAYMENTS_SERVICE, User } from '@app/common';
import { ClientProxy } from '@nestjs/microservices';
import { FindOptionsWhere } from 'typeorm';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import { Reservation } from './models/reservation.entity';

export const ADMIN_ROLE = 'Admin';

// Covers the round trip to Stripe, which can take several seconds.
export const PAYMENTS_TIMEOUT_MS = 15000;

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly reservationRepository: ReservationsRepository,
    @Inject(PAYMENTS_SERVICE) private readonly paymentService: ClientProxy,
  ) {}

  async create(
    { startDate, endDate, charge }: CreateReservationDto,
    { email, id: userId }: User,
    idempotencyKey?: string,
  ) {
    this.assertValidPeriod(startDate, endDate, { mustBeFuture: true });

    const paymentIntent = await this.callPayments<{ id: string }>(
      'create_charge',
      { ...charge, email, idempotencyKey },
    );

    try {
      return await this.reservationRepository.create(
        new Reservation({
          startDate,
          endDate,
          timestamp: new Date(),
          userId,
          invoiceId: paymentIntent.id,
        }),
      );
    } catch (error) {
      // The customer has paid for a reservation that does not exist. Undo the
      // charge rather than leave it for support to find.
      this.logger.error(
        `Saving reservation failed after charge ${paymentIntent.id}; refunding`,
        (error as Error)?.stack,
      );
      await this.refund(paymentIntent.id);
      throw new InternalServerErrorException(
        'The reservation could not be saved and the charge has been refunded.',
      );
    }
  }

  findAll(user: User) {
    return this.reservationRepository.find(this.scopeTo(user));
  }

  findOne(id: number, user: User) {
    return this.reservationRepository.findOne({ ...this.scopeTo(user), id });
  }

  async update(
    id: number,
    updateReservationDto: UpdateReservationDto,
    user: User,
  ) {
    const where = { ...this.scopeTo(user), id };

    // Either date may be changed alone, so the range is checked against the
    // stored value of the other one.
    if (updateReservationDto.startDate || updateReservationDto.endDate) {
      const existing = await this.reservationRepository.findOne(where);
      this.assertValidPeriod(
        updateReservationDto.startDate ?? existing.startDate,
        updateReservationDto.endDate ?? existing.endDate,
        { mustBeFuture: Boolean(updateReservationDto.startDate) },
      );
    }

    return this.reservationRepository.findOneAndUpdate(
      where,
      updateReservationDto,
    );
  }

  remove(id: number, user: User) {
    return this.reservationRepository.findOneAndDelete({
      ...this.scopeTo(user),
      id,
    });
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

  private assertValidPeriod(
    startDate: Date,
    endDate: Date,
    { mustBeFuture }: { mustBeFuture: boolean },
  ) {
    if (new Date(endDate) <= new Date(startDate)) {
      throw new BadRequestException('endDate must be after startDate');
    }
    if (mustBeFuture && new Date(startDate) < new Date()) {
      throw new BadRequestException('startDate must not be in the past');
    }
  }

  private async refund(paymentIntentId: string) {
    try {
      await this.callPayments('refund_charge', { paymentIntentId });
    } catch (error) {
      // Logged with the payment intent id so it can be refunded by hand.
      this.logger.error(
        `MANUAL ACTION REQUIRED: refund of ${paymentIntentId} failed`,
        error instanceof Error ? error.stack : JSON.stringify(error),
      );
    }
  }

  private async callPayments<R>(pattern: string, data: object): Promise<R> {
    try {
      return await firstValueFrom(
        this.paymentService
          .send<R>(pattern, data)
          .pipe(timeout(PAYMENTS_TIMEOUT_MS)),
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
