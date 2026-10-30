import { IsInt, IsNotEmpty, IsPositive, IsString } from 'class-validator';

/**
 * Message patterns payments sends to reservations when Stripe reports, by
 * webhook, how a charge ended. They settle bookings whose charge outcome was
 * unknown at the time (a timeout, say), without waiting for the client to
 * retry.
 */
export const PAYMENT_SUCCEEDED = 'payment_succeeded';
export const PAYMENT_FAILED = 'payment_failed';

export class PaymentOutcomeDto {
  @IsInt()
  @IsPositive()
  reservationId: number;

  @IsString()
  @IsNotEmpty()
  paymentIntentId: string;
}
