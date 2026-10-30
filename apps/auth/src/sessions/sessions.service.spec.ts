import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Session } from './session.entity';
import { SessionsService } from './sessions.service';
import {
  formatRefreshToken,
  hashSecret,
  newSecret,
  parseRefreshToken,
} from './refresh-token';

describe('refresh tokens', () => {
  it('round-trips through format and parse', () => {
    const token = { sessionId: 42, secret: newSecret() };

    expect(parseRefreshToken(formatRefreshToken(token))).toEqual(token);
  });

  it.each([undefined, '', '42', '42.short', 'abc.' + newSecret(), 42])(
    'refuses a malformed token: %p',
    (token) => {
      expect(parseRefreshToken(token)).toBeNull();
    },
  );
});

describe('SessionsService', () => {
  let service: SessionsService;
  let repository: {
    create: jest.Mock;
    deleteFinished: jest.Mock;
    findActive: jest.Mock;
    replaceRefreshTokenHash: jest.Mock;
    revoke: jest.Mock;
  };

  /** A stored session, and a refresh token that is currently valid for it. */
  function existingSession() {
    const secret = newSecret();
    const session = new Session({
      id: 7,
      userId: 3,
      refreshTokenHash: hashSecret(secret),
    });
    repository.findActive.mockResolvedValue(session);
    return {
      session,
      token: formatRefreshToken({ sessionId: 7, secret }),
    };
  }

  beforeEach(() => {
    repository = {
      create: jest.fn((session: Session) =>
        Promise.resolve(Object.assign(session, { id: 7 })),
      ),
      deleteFinished: jest.fn(),
      findActive: jest.fn().mockResolvedValue(null),
      replaceRefreshTokenHash: jest.fn().mockResolvedValue(true),
      revoke: jest.fn(),
    };
    const config = {
      getOrThrow: () => 3600,
    } as unknown as ConfigService;
    service = new SessionsService(repository as any, config);
  });

  describe('start', () => {
    it('stores only a hash of the refresh token', async () => {
      const { refreshToken } = await service.start(3);

      const [stored] = repository.create.mock.calls[0];
      const { secret } = parseRefreshToken(refreshToken)!;
      expect(stored.refreshTokenHash).toBe(hashSecret(secret));
      expect(JSON.stringify(stored)).not.toContain(secret);
    });

    it('expires after REFRESH_TOKEN_EXPIRATION', async () => {
      const before = Date.now();

      const { session } = await service.start(3);

      expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + 3600_000,
      );
    });

    it("clears out the user's finished sessions", async () => {
      await service.start(3);

      expect(repository.deleteFinished).toHaveBeenCalledWith(3);
    });
  });

  describe('rotate', () => {
    it('issues a new token for the same session and retires the old one', async () => {
      const { session, token } = existingSession();

      const rotated = await service.rotate(token);

      expect(rotated.session.id).toBe(7);
      expect(rotated.refreshToken).not.toBe(token);
      expect(repository.replaceRefreshTokenHash).toHaveBeenCalledWith(
        7,
        session.refreshTokenHash,
        hashSecret(parseRefreshToken(rotated.refreshToken)!.secret),
      );
    });

    it('revokes the whole session when a used token comes back', async () => {
      existingSession();
      const stale = formatRefreshToken({ sessionId: 7, secret: newSecret() });

      await expect(service.rotate(stale)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repository.revoke).toHaveBeenCalledWith({ id: 7 });
    });

    it('refuses the loser of two concurrent refreshes without revoking', async () => {
      const { token } = existingSession();
      repository.replaceRefreshTokenHash.mockResolvedValue(false);

      await expect(service.rotate(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repository.revoke).not.toHaveBeenCalled();
    });

    it('refuses a token for a session that is revoked or expired', async () => {
      const { token } = existingSession();
      repository.findActive.mockResolvedValue(null);

      await expect(service.rotate(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('refuses a missing token', async () => {
      await expect(service.rotate(undefined)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('endByRefreshToken', () => {
    it('revokes the session the token belongs to', async () => {
      const { token } = existingSession();

      await service.endByRefreshToken(token);

      expect(repository.revoke).toHaveBeenCalledWith({ id: 7 });
    });

    it('does not revoke on a guessed session id with the wrong secret', async () => {
      existingSession();

      await service.endByRefreshToken(
        formatRefreshToken({ sessionId: 7, secret: newSecret() }),
      );

      expect(repository.revoke).not.toHaveBeenCalled();
    });
  });

  it('ends every session of a user', async () => {
    await service.endAll(3);

    expect(repository.revoke).toHaveBeenCalledWith({ userId: 3 });
  });
});
