import { CreateChargeDto } from '@app/common';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class PaymentCreateChargeDto extends CreateChargeDto {
  // Stored on the PaymentIntent, so a webhook about it can name the booking
  // it settles.
  @IsInt()
  @IsPositive()
  reservationId: number;

  // Forwarded to Stripe so that a retried request cannot charge twice;
  // reservations derives it from the reservation id.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
