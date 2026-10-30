import { PartialType } from '@nestjs/swagger';
import { CreatePlaceDto } from './create-place.dto';

// A new price applies to bookings made afterwards; existing reservations keep
// the amount they were charged.
export class UpdatePlaceDto extends PartialType(CreatePlaceDto) {}
