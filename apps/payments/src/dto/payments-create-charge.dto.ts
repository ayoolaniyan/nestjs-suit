import { CreateChargeDto } from '@app/common';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class PaymentCreateChargeDto extends CreateChargeDto {
  @IsEmail()
  email: string;

  // Forwarded to Stripe so that a retried request cannot charge twice.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
