import { AbstractEntity } from '@app/common';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { Place } from '../places/place.entity';

export enum ReservationStatus {
  /** Dates held while the charge is in flight. */
  Pending = 'pending',
  Confirmed = 'confirmed',
  /** The charge failed or the booking could not be completed. */
  Failed = 'failed',
  Cancelled = 'cancelled',
}

@Entity()
// A client's Idempotency-Key identifies one booking attempt per user. NULLs
// are not considered equal in a MySQL unique index, so requests without a key
// are unaffected.
@Index(['userId', 'idempotencyKey'], { unique: true })
export class Reservation extends AbstractEntity<Reservation> {
  /** Check-in date (UTC midnight). */
  @Column()
  startDate: Date;

  /** Check-out date (UTC midnight); the night before it is the last booked. */
  @Column()
  endDate: Date;

  // Every owner-scoped query filters on it.
  @Index()
  @Column()
  userId: number;

  // Nullable only for reservations made before places existed.
  @Column({ type: 'int', nullable: true })
  placeId: number | null;

  @ManyToOne(() => Place, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'placeId' })
  place?: Place;

  @Column({
    type: 'varchar',
    length: 16,
    default: ReservationStatus.Pending,
  })
  status: ReservationStatus;

  /** Total charged, in US cents; computed by the server, never the client. */
  @Column({ type: 'int', nullable: true })
  amountCents: number | null;

  /** Stripe PaymentIntent id; set once the charge succeeds. */
  @Column({ type: 'varchar', nullable: true })
  invoiceId: string | null;

  /** Stripe Refund id; set when a confirmed reservation is cancelled. */
  @Column({ type: 'varchar', nullable: true })
  refundId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  idempotencyKey: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
