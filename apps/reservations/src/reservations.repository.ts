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

export interface ConfirmResult {
  /**
   * `confirmed`: it was pending and is now confirmed. `unavailable`: it was
   * pending, but another booking took the dates after its hold lapsed.
   * `unchanged`: it was no longer pending.
   */
  outcome: 'confirmed' | 'unavailable' | 'unchanged';
  reservation: Reservation;
}

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

  /**
   * Confirms a pending reservation once its charge has succeeded, provided
   * its dates are still free.
   *
   * They normally are, since the reservation holds them. But the hold lapses
   * after PENDING_HOLD_MS, and a charge can succeed later than that: a client
   * retrying with its Idempotency-Key, or Stripe's webhook arriving after an
   * outage. By then someone else may have booked the dates, so the check is
   * repeated under the same place lock as a new booking.
   */
  async confirmIfAvailable(
    id: number,
    invoiceId: string,
  ): Promise<ConfirmResult> {
    return this.entityManager.transaction(async (manager) => {
      const found = await manager.findOne(Reservation, {
        where: { id },
        select: { id: true, placeId: true },
      });
      if (!found) {
        throw new NotFoundException('Reservation not found');
      }
      const { placeId } = found;
      // The place first, the same order as holdIfAvailable, so the two
      // cannot deadlock.
      if (placeId !== null) {
        await manager.findOne(Place, {
          where: { id: placeId },
          lock: { mode: 'pessimistic_write' },
        });
      }
      const reservation = await manager.findOneOrFail(Reservation, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (reservation.status !== ReservationStatus.Pending) {
        return { outcome: 'unchanged', reservation };
      }

      if (placeId !== null) {
        const taken = await this.blocking(
          manager,
          placeId,
          reservation.startDate,
          reservation.endDate,
        )
          .andWhere('r.id != :id', { id })
          .getExists();
        if (taken) {
          return { outcome: 'unavailable', reservation };
        }
      }

      reservation.status = ReservationStatus.Confirmed;
      reservation.invoiceId = invoiceId;
      return {
        outcome: 'confirmed',
        reservation: await manager.save(reservation),
      };
    });
  }

  /** Releases a pending reservation's dates; anything else is left as is. */
  async failIfPending(id: number): Promise<boolean> {
    const result = await this.entityManager.update(
      Reservation,
      { id, status: ReservationStatus.Pending },
      { status: ReservationStatus.Failed },
    );
    return result.affected === 1;
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
