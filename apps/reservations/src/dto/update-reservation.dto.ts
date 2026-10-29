import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateReservationDto } from './create-reservation.dto';

// `charge` is excluded: payment happens once, at creation. Passing it through
// also sent a non-column field into the UPDATE and failed the query.
export class UpdateReservationDto extends PartialType(
  OmitType(CreateReservationDto, ['charge'] as const),
) {}
