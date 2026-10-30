import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Session } from './session.entity';
import { SessionsRepository } from './sessions.repository';
import {
  formatRefreshToken,
  hashSecret,
  newSecret,
  parseRefreshToken,
  secretMatches,
} from './refresh-token';

export interface IssuedSession {
  session: Session;
  refreshToken: string;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly configService: ConfigService,
  ) {}

  async start(userId: number): Promise<IssuedSession> {
    await this.sessionsRepository.deleteFinished(userId);

    const secret = newSecret();
    const lifetimeMs =
      this.configService.getOrThrow<number>('REFRESH_TOKEN_EXPIRATION') * 1000;
    const session = await this.sessionsRepository.create(
      new Session({
        userId,
        refreshTokenHash: hashSecret(secret),
        expiresAt: new Date(Date.now() + lifetimeMs),
        revokedAt: null,
      }),
    );
    return {
      session,
      refreshToken: formatRefreshToken({ sessionId: session.id, secret }),
    };
  }

  /**
   * Exchanges a refresh token for a new one. Each token works once: a token
   * that has already been exchanged means two parties hold it, one of them
   * probably a thief, so the whole session is revoked and both must log in
   * again.
   */
  async rotate(refreshToken: unknown): Promise<IssuedSession> {
    const token = parseRefreshToken(refreshToken);
    const session =
      token && (await this.sessionsRepository.findActive(token.sessionId));
    if (!token || !session) {
      throw new UnauthorizedException();
    }

    if (!secretMatches(token.secret, session.refreshTokenHash)) {
      this.logger.warn(
        `Refresh token reused for session ${session.id}; revoking the session`,
      );
      await this.sessionsRepository.revoke({ id: session.id });
      throw new UnauthorizedException();
    }

    const secret = newSecret();
    const rotated = await this.sessionsRepository.replaceRefreshTokenHash(
      session.id,
      session.refreshTokenHash,
      hashSecret(secret),
    );
    if (!rotated) {
      // Another request with the same token got there first.
      throw new UnauthorizedException();
    }
    return {
      session,
      refreshToken: formatRefreshToken({ sessionId: session.id, secret }),
    };
  }

  /**
   * Ends the session a refresh token belongs to. The secret must match, or
   * anyone could log anyone out by guessing session ids.
   */
  async endByRefreshToken(refreshToken: unknown) {
    const token = parseRefreshToken(refreshToken);
    const session =
      token && (await this.sessionsRepository.findActive(token.sessionId));
    if (
      token &&
      session &&
      secretMatches(token.secret, session.refreshTokenHash)
    ) {
      await this.sessionsRepository.revoke({ id: session.id });
    }
  }

  /** For a session id taken from a verified access token. */
  async end(sessionId: number) {
    await this.sessionsRepository.revoke({ id: sessionId });
  }

  async endAll(userId: number) {
    await this.sessionsRepository.revoke({ userId });
  }

  async isActive(sessionId: number, userId: number) {
    return !!(await this.sessionsRepository.findActive(sessionId, userId));
  }
}
