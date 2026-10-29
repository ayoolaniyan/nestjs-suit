import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateChargeDto {
  // A Stripe PaymentMethod id (pm_...) created on the client with Stripe.js /
  // Elements. Raw card numbers must never reach these services: handling them
  // brings the whole system into PCI-DSS scope.
  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;

  @IsNumber()
  amount: number;
}
