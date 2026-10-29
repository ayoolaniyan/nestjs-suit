import { Inject, Injectable } from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationsRepository } from './reservations.repository';
import { PAYMENTS_SERVICE, User } from '@app/common';
import { ClientProxy } from '@nestjs/microservices';
import { FindOptionsWhere } from 'typeorm';
import { map } from 'rxjs';
import { Reservation } from './models/reservation.entity';

export const ADMIN_ROLE = 'Admin';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly reservationRepository: ReservationsRepository,
    @Inject(PAYMENTS_SERVICE) private readonly paymentService: ClientProxy,
  ) {}

  create(
    createReservationDto: CreateReservationDto,
    { email, id: userId }: User,
  ) {
    return this.paymentService
      .send('create_charge', { ...createReservationDto.charge, email })
      .pipe(
        map((res) => {
          const reservation = new Reservation({
            ...createReservationDto,
            timestamp: new Date(),
            userId,
            invoiceId: res.id,
          });
          return this.reservationRepository.create(reservation);
        }),
      );
  }

  findAll(user: User) {
    return this.reservationRepository.find(this.scopeTo(user));
  }

  findOne(id: number, user: User) {
    return this.reservationRepository.findOne({ ...this.scopeTo(user), id });
  }

  update(id: number, updateReservationDto: UpdateReservationDto, user: User) {
    return this.reservationRepository.findOneAndUpdate(
      { ...this.scopeTo(user), id },
      updateReservationDto,
    );
  }

  remove(id: number, user: User) {
    return this.reservationRepository.findOneAndDelete({
      ...this.scopeTo(user),
      id,
    });
  }

  /**
   * Restricts a query to the caller's own reservations unless they are an
   * admin. Someone else's reservation therefore surfaces as "not found"
   * rather than "forbidden", which does not confirm that the id exists.
   */
  private scopeTo(user: User): FindOptionsWhere<Reservation> {
    const isAdmin = user.roles?.some((role) => role.name === ADMIN_ROLE);
    return isAdmin ? {} : { userId: user.id };
  }
}
