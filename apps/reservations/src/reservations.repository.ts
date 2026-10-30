import { AbstractRepository } from '@app/common';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Reservation, ReservationStatus } from './models/reservation.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, Repository } from 'typeorm';
import { Place } from './places/place.entity';
import { PENDING_HOLD_MS } from './booking-rules';

@Injectable()
export class ReservationsRepository extends AbstractRepository<Reservation> {
  protected readonly logger = new Logger(ReservationsRepository.name);

  constructor(
    @InjectRepository(Reservation)
    reservationRepository: Repository<Reservation>,
    entityManager: EntityManager,
  ) {
    super(reservationRepository, entityManager);
  }

  /**
   * Saves a pending reservation if its place is free for those dates.
   *
   * The place row is locked for the transaction, so concurrent bookings of the
   * same place queue here and the check and the insert act as one step;
   * without the lock, two requests could both see the dates free and both be
   * charged.
   */
  async holdIfAvailable(reservation: Reservation): Promise<Reservation> {
    return this.entityManager.transaction(async (manager) => {
      const place = await manager.findOne(Place, {
        where: { id: reservation.placeId! },
        lock: { mode: 'pessimistic_write' },
      });
      if (!place) {
        throw new NotFoundException('Place not found');
      }

      const taken = await this.blocking(
        manager,
        place.id,
        reservation.startDate,
        reservation.endDate,
      ).getExists();
      if (taken) {
        throw new ConflictException(
          'The place is not available for those dates',
        );
      }

      return manager.save(reservation);
    });
  }

  /** The stays that make a place unavailable within [from, to). */
  async findBlocking(
    placeId: number,
    from: Date,
    to: Date,
  ): Promise<Pick<Reservation, 'startDate' | 'endDate'>[]> {
    return this.blocking(this.entityManager, placeId, from, to)
      .select(['r.startDate', 'r.endDate'])
      .orderBy('r.startDate')
      .getMany();
  }

  /**
   * Confirmed reservations, plus pending ones still within their hold, whose
   * stay overlaps [start, end). Ranges overlap when each starts before the
   * other ends, so a check-out day is free for the next check-in.
   */
  private blocking(
    manager: EntityManager,
    placeId: number,
    start: Date,
    end: Date,
  ) {
    return manager
      .createQueryBuilder(Reservation, 'r')
      .where('r.placeId = :placeId', { placeId })
      .andWhere('r.startDate < :end AND r.endDate > :start', { start, end })
      .andWhere(
        new Brackets((qb) =>
          qb
            .where('r.status = :confirmed', {
              confirmed: ReservationStatus.Confirmed,
            })
            .orWhere('(r.status = :pending AND r.createdAt > :holdCutoff)', {
              pending: ReservationStatus.Pending,
              holdCutoff: new Date(Date.now() - PENDING_HOLD_MS),
            }),
        ),
      );
  }
}
