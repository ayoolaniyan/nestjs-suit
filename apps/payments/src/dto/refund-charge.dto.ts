import { IsNotEmpty, IsString } from 'class-validator';

export class RefundChargeDto {
  @IsString()
  @IsNotEmpty()
  paymentIntentId: string;
}
