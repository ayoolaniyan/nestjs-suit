import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePlaceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /**
   * Price of one night in US cents, e.g. 12500 for $125.00. At least 50
   * (Stripe's minimum charge) and at most 1,000,000.
   */
  @IsInt()
  @Min(50)
  @Max(1_000_000)
  pricePerNightCents: number;
}
