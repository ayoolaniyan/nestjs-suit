import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateReservationDto {
  @IsInt()
  @IsPositive()
  placeId: number;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-12-01',
    description: 'Check-in date.',
  })
  @IsDate()
  @Type(() => Date)
  startDate: Date;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-12-04',
    description: 'Check-out date. The night before it is the last one booked.',
  })
  @IsDate()
  @Type(() => Date)
  endDate: Date;

  /**
   * A Stripe PaymentMethod id (pm_...) created on the client with Stripe.js.
   * The amount is not sent: the server computes it from the place's price.
   */
  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;
}
