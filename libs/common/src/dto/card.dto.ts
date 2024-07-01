import { IsNumber, IsString } from 'class-validator';

export class CardDto {
  @IsString()
  cvc?: string;

  @IsNumber()
  exp_month?: number;

  @IsNumber()
  exp_year?: number;

  networks?: any;

  @IsString()
  number?: string;

  // @IsString()
  // token?: string;
}
