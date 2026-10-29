import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Stripe } from 'stripe';
import { NOTIFICATION_SERVICE } from '@app/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PaymentCreateChargeDto } from './dto/payments-create-charge.dto';
import { RefundChargeDto } from './dto/refund-charge.dto';

@Injectable()
export class PaymentsService {
  private readonly stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    @Inject(NOTIFICATION_SERVICE)
    private readonly notificationService: ClientProxy,
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
    amount,
    email,
    paymentMethodId,
    idempotencyKey,
  }: PaymentCreateChargeDto) {
    const paymentintent = await this.callStripe(() =>
      this.stripe.paymentIntents.create(
        {
          payment_method: paymentMethodId,
          // Rounded because binary floating point cannot represent most
          // decimals: 19.99 * 100 is 1998.9999999999998, which Stripe rejects.
          amount: Math.round(amount * 100),
          confirm: true,
          payment_method_types: ['card'],
          currency: 'usd',
        },
        { idempotencyKey },
      ),
    );

    this.notificationService.emit('notify_email', {
      email,
      text: `Your payment of $${amount.toFixed(2)} has completed successfully.`,
    });
    return paymentintent;
  }

  async refundCharge({ paymentIntentId }: RefundChargeDto) {
    return this.callStripe(() =>
      this.stripe.refunds.create({ payment_intent: paymentIntentId }),
    );
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
      if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: error.message,
        });
      }
      throw new RpcException({
        status: HttpStatus.BAD_GATEWAY,
        message: 'Payment provider error',
      });
    }
  }
}
