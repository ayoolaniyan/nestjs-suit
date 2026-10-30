import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const user = { id: 3 };
  let sessions: { isActive: jest.Mock };
  let strategy: JwtStrategy;

  beforeEach(() => {
    sessions = { isActive: jest.fn().mockResolvedValue(true) };
    strategy = new JwtStrategy(
      { get: () => 'secret' } as unknown as ConfigService,
      { getUser: jest.fn().mockResolvedValue(user) } as any,
      sessions as any,
    );
  });

  it('resolves the user while the session is active', async () => {
    await expect(strategy.validate({ userId: 3, sid: 7 })).resolves.toBe(user);
    expect(sessions.isActive).toHaveBeenCalledWith(7, 3);
  });

  it('refuses a token whose session has been revoked', async () => {
    sessions.isActive.mockResolvedValue(false);

    await expect(
      strategy.validate({ userId: 3, sid: 7 }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('refuses a token issued before sessions existed', async () => {
    await expect(
      strategy.validate({ userId: 3 } as any),
    ).rejects.toBeInstanceOf(HttpException);
    expect(sessions.isActive).not.toHaveBeenCalled();
  });
});
