import { AbstractRepository } from '@app/common';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, MoreThan, Repository } from 'typeorm';
import { Session } from './session.entity';

@Injectable()
export class SessionsRepository extends AbstractRepository<Session> {
  protected readonly logger = new Logger(SessionsRepository.name);

  constructor(
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    entityManager: EntityManager,
  ) {
    super(sessions, entityManager);
  }

  /**
   * Swaps the refresh token hash only if it is still the one the caller
   * presented, so of two concurrent refreshes with the same token exactly
   * one succeeds.
   */
  async replaceRefreshTokenHash(
    id: number,
    currentHash: string,
    nextHash: string,
  ): Promise<boolean> {
    const result = await this.sessions.update(
      { id, refreshTokenHash: currentHash, revokedAt: IsNull() },
      { refreshTokenHash: nextHash },
    );
    return result.affected === 1;
  }

  async revoke(where: { id: number } | { userId: number }) {
    await this.sessions.update(
      { ...where, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /** Housekeeping: a user's sessions that can never be used again. */
  async deleteFinished(userId: number) {
    const now = new Date();
    await this.sessions
      .createQueryBuilder()
      .delete()
      .where('userId = :userId', { userId })
      .andWhere('(expiresAt < :now OR revokedAt IS NOT NULL)', { now })
      .execute();
  }

  /** Neither revoked nor expired. */
  findActive(id: number, userId?: number) {
    return this.sessions.findOne({
      where: {
        id,
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
  }
}
