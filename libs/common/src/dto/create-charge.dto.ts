import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateChargeDto {
  // A Stripe PaymentMethod id (pm_...) created on the client with Stripe.js /
  // Elements. Raw card numbers must never reach these services: handling them
  // brings the whole system into PCI-DSS scope.
  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;

  // In dollars. At most two decimal places, so it converts to a whole number
  // of cents exactly; 0.50 is Stripe's minimum USD charge.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  amount: number;
}
