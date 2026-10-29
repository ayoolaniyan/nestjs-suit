import { AbstractEntity } from '@app/common';
import { Column, Entity, Index } from 'typeorm';

@Entity()
export class Reservation extends AbstractEntity<Reservation> {
  @Column()
  timestamp: Date;
  @Column()
  startDate: Date;
  @Column()
  endDate: Date;
  // Every owner-scoped query filters on it.
  @Index()
  @Column()
  userId: number;
  @Column()
  invoiceId: string;
}
