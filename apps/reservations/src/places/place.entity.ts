import { AbstractEntity } from '@app/common';
import { Column, CreateDateColumn, Entity, UpdateDateColumn } from 'typeorm';

@Entity()
export class Place extends AbstractEntity<Place> {
  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Price of one night, in US cents. Money is always whole cents. */
  @Column({ type: 'int' })
  pricePerNightCents: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
