import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Stripe } from 'stripe';
import {
  PAYMENT_FAILED,
  PAYMENT_SUCCEEDED,
  PaymentOutcomeDto,
  RESERVATIONS_SERVICE,
  observeRpc,
  withRequestId,
} from '@app/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { PaymentCreateChargeDto } from './dto/payments-create-charge.dto';
import { RefundChargeDto } from './dto/refund-charge.dto';

export const RESERVATIONS_TIMEOUT_MS = 10_000;

/** The webhook events that settle a booking, and what each is sent as. */
const OUTCOME_PATTERNS: Partial<Record<Stripe.Event.Type, string>> = {
  'payment_intent.succeeded': PAYMENT_SUCCEEDED,
  'payment_intent.payment_failed': PAYMENT_FAILED,
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    @Inject(RESERVATIONS_SERVICE)
    private readonly reservationsService: ClientProxy,
  ) {
    this.stripe = new Stripe(
      this.configService.getOrThrow<string>('STRIPE_SECRET_KEY'),
      {
        // Pinned to the version the installed SDK's types describe. Leaving
        // it behind the SDK is a type error, not a silent fallback.
        apiVersion: '2024-06-20',
      },
    );
  }

  async createCharge({
    amountCents,
    paymentMethodId,
    reservationId,
    idempotencyKey,
  }: PaymentCreateChargeDto) {
    // No email from here any more: reservations sends the confirmation once
    // the booking itself is confirmed, which happens exactly once whichever
    // path (this reply or the webhook) gets there first.
    return this.callStripe(() =>
      this.stripe.paymentIntents.create(
        {
          payment_method: paymentMethodId,
          amount: amountCents,
          confirm: true,
          payment_method_types: ['card'],
          currency: 'usd',
          metadata: { reservationId: String(reservationId) },
        },
        { idempotencyKey },
      ),
    );
  }

  async refundCharge({ paymentIntentId, idempotencyKey }: RefundChargeDto) {
    return this.callStripe(() =>
      this.stripe.refunds.create(
        { payment_intent: paymentIntentId },
        { idempotencyKey },
      ),
    );
  }

  /**
   * Handles a Stripe webhook delivery. The signature proves Stripe sent it;
   * without the check anyone could post "payment succeeded" and get a free
   * booking.
   *
   * Answering with an error makes Stripe redeliver (for up to three days),
   * so a reservations outage delays a confirmation instead of losing it.
   * Redeliveries are safe: reservations ignores outcomes it already has.
   */
  async handleWebhook(rawBody: Buffer | undefined, signature: unknown) {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody ?? '',
        typeof signature === 'string' ? signature : '',
        this.configService.getOrThrow<string>('STRIPE_WEBHOOK_SECRET'),
      );
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }

    const pattern = OUTCOME_PATTERNS[event.type];
    if (!pattern) {
      return { received: true };
    }

    const intent = event.data.object as Stripe.PaymentIntent;
    const reservationId = Number(intent.metadata?.reservationId);
    if (!Number.isInteger(reservationId) || reservationId <= 0) {
      // Not one of ours (a payment taken in the dashboard, say).
      this.logger.warn(
        `${event.type} for ${intent.id} names no reservation; ignored`,
      );
      return { received: true };
    }

    const outcome: PaymentOutcomeDto = {
      reservationId,
      paymentIntentId: intent.id,
    };
    try {
      await firstValueFrom(
        this.reservationsService
          .send(pattern, withRequestId(outcome))
          .pipe(timeout(RESERVATIONS_TIMEOUT_MS), observeRpc(pattern)),
      );
    } catch (error) {
      const status = (error as { status?: unknown })?.status;
      const detail = (error as Error)?.message ?? JSON.stringify(error);
      // A refusal (no such reservation, say) will not change on redelivery.
      if (typeof status === 'number' && status < 500) {
        this.logger.warn(
          `Reservations refused ${event.type} for reservation ${reservationId}: ${detail}`,
        );
        return { received: true };
      }
      this.logger.error(
        `Could not record ${event.type} for reservation ${reservationId}: ${detail}`,
      );
      throw new ServiceUnavailableException(
        'The event could not be recorded; redeliver it',
      );
    }
    return { received: true };
  }

  /**
   * Re-raises Stripe errors as RpcExceptions with an HTTP-style status. Left
   * alone they reach the caller as an opaque "Internal server error", so a
   * declined card was indistinguishable from an outage.
   */
  private async callStripe<R>(request: () => Promise<R>): Promise<R> {
    try {
      return await request();
    } catch (error) {
      if (error instanceof Stripe.errors.StripeCardError) {
        throw new RpcException({
          status: HttpStatus.PAYMENT_REQUIRED,
          message: error.message,
        });
      }
      // An idempotency key reused with different parameters, or while the
      // first request with it is still running.
      if (error instanceof Stripe.errors.StripeIdempotencyError) {
        throw new RpcException({
          status: HttpStatus.CONFLICT,
          message: error.message,
        });
      }
      if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: error.message,
        });
      }
      // The caller gets a generic message; the cause is logged here.
      this.logger.error(
        `Stripe request failed: ${(error as Error)?.message}`,
        (error as Error)?.stack,
      );
      throw new RpcException({
        status: HttpStatus.BAD_GATEWAY,
        message: 'Payment provider error',
      });
    }
  }
}
