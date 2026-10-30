import { BookingEmailData, EmailTemplate, NotifyEmailEvent } from '@app/common';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsPositive,
  Min,
  ValidateNested,
} from 'class-validator';

class BookingEmailDataDto implements BookingEmailData {
  @IsInt()
  @IsPositive()
  reservationId: number;

  @IsISO8601({ strict: true })
  startDate: string;

  @IsISO8601({ strict: true })
  endDate: string;

  @IsInt()
  @Min(0)
  amountCents: number;
}

export class NotifyEmailDto implements NotifyEmailEvent {
  @IsEmail()
  email: string;

  @IsEnum(EmailTemplate)
  template: EmailTemplate;

  @ValidateNested()
  @Type(() => BookingEmailDataDto)
  data: BookingEmailDataDto;
}
