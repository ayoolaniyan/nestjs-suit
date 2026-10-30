import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RefundChargeDto {
  @IsString()
  @IsNotEmpty()
  paymentIntentId: string;

  // Forwarded to Stripe so a retried refund returns the original refund
  // instead of failing as "already refunded".
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
