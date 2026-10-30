import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/** The create_charge message contract between reservations and payments. */
export class CreateChargeDto {
  // A Stripe PaymentMethod id (pm_...) created on the client with Stripe.js /
  // Elements. Raw card numbers must never reach these services: handling them
  // brings the whole system into PCI-DSS scope.
  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;

  // Whole US cents, computed by reservations from the place's price, so no
  // floating-point conversion happens anywhere. 50 is Stripe's minimum.
  @IsInt()
  @Min(50)
  amountCents: number;
}
