import { AbstractEntity, User } from '@app/common';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';

/**
 * One signed-in device. Access tokens name their session, so revoking it
 * (logout) rejects them at once rather than when they expire.
 */
@Entity()
export class Session extends AbstractEntity<Session> {
  @Index()
  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  // SHA-256 of the current refresh token's secret. Only the hash is stored,
  // so a database leak does not hand out sessions. Replaced on every
  // refresh.
  @Column({ length: 64 })
  refreshTokenHash: string;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
