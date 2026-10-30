import { CreateChargeDto } from '@app/common';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class PaymentCreateChargeDto extends CreateChargeDto {
  @IsEmail()
  email: string;

  // Forwarded to Stripe so that a retried request cannot charge twice;
  // reservations derives it from the reservation id.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
