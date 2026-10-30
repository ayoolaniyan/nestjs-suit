import { BadRequestException, Injectable } from '@nestjs/common';
import { PlacesRepository } from './places.repository';
import { ReservationsRepository } from '../reservations.repository';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { Place } from './place.entity';
import { MAX_AVAILABILITY_DAYS, wholeDaysBetween } from '../booking-rules';

@Injectable()
export class PlacesService {
  constructor(
    private readonly placesRepository: PlacesRepository,
    private readonly reservationsRepository: ReservationsRepository,
  ) {}

  create(createPlaceDto: CreatePlaceDto) {
    return this.placesRepository.create(new Place(createPlaceDto));
  }

  findAll() {
    return this.placesRepository.find({});
  }

  findOne(id: number) {
    return this.placesRepository.findOne({ id });
  }

  update(id: number, updatePlaceDto: UpdatePlaceDto) {
    return this.placesRepository.findOneAndUpdate({ id }, updatePlaceDto);
  }

  /**
   * The booked stays within [from, to). Only dates are disclosed, never who
   * holds them.
   */
  async availability(id: number, from: Date, to: Date) {
    await this.findOne(id);

    if (wholeDaysBetween(from, to) > MAX_AVAILABILITY_DAYS) {
      throw new BadRequestException(
        `The window can be at most ${MAX_AVAILABILITY_DAYS} days`,
      );
    }

    const booked = await this.reservationsRepository.findBlocking(id, from, to);
    return {
      placeId: id,
      from,
      to,
      available: booked.length === 0,
      booked: booked.map(({ startDate, endDate }) => ({ startDate, endDate })),
    };
  }
}
