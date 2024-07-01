import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Stripe } from 'stripe';
import { NOTIFICATION_SERVICE } from '@app/common';
import { ClientProxy } from '@nestjs/microservices';
import { PaymentCreateChargeDto } from './dto/payments-create-charge.dto';

@Injectable()
export class PaymentsService {
  private readonly stripe = new Stripe(
    this.configService.get<string>('STRIPE_SECRET_KEY'),
    {
      apiVersion: '2024-04-10',
    },
  );
  constructor(
    private readonly configService: ConfigService,
    @Inject(NOTIFICATION_SERVICE)
    private readonly notificationService: ClientProxy,
  ) {}

  async createCharge({ amount, email }: PaymentCreateChargeDto) {
    const paymentintent = await this.stripe.paymentIntents.create({
      payment_method: 'pm_card_us',
      amount: amount * 100,
      confirm: true,
      payment_method_types: ['card'],
      currency: 'usd',
    });

    this.notificationService.emit('notify_email', {
      email,
      text: `Your payment of $${amount} has completed successfully.`,
    });
    return paymentintent;
  }
}
