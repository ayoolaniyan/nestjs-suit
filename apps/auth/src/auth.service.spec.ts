import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@app/common';
import { Request, Response } from 'express';
import { ACCESS_COOKIE, AuthService, REFRESH_COOKIE } from './auth.service';
import { Session } from './sessions/session.entity';

describe('AuthService', () => {
  const config: Record<string, unknown> = {
    JWT_SECRET: 'secret',
    JWT_EXPIRATION: 900,
    NODE_ENV: 'production',
  };
  const configService = {
    get: (key: string) => config[key],
    getOrThrow: (key: string) => config[key],
  } as unknown as ConfigService;
  const jwtService = new JwtService({ secret: 'secret' });

  const session = new Session({
    id: 7,
    userId: 3,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  let sessions: Record<string, jest.Mock>;
  let users: { getUser: jest.Mock };
  let service: AuthService;
  let response: { cookie: jest.Mock; clearCookie: jest.Mock };

  const user = new User({ id: 3, email: 'user@example.com' });
  const cookie = (name: string) =>
    response.cookie.mock.calls.find(([cookieName]) => cookieName === name);
  const request = (cookies: Record<string, string>) =>
    ({ cookies }) as unknown as Request;

  beforeEach(() => {
    sessions = {
      start: jest.fn().mockResolvedValue({ session, refreshToken: '7.new' }),
      rotate: jest.fn().mockResolvedValue({ session, refreshToken: '7.next' }),
      endByRefreshToken: jest.fn(),
      end: jest.fn(),
      endAll: jest.fn(),
    };
    users = { getUser: jest.fn().mockResolvedValue(user) };
    service = new AuthService(
      configService,
      jwtService,
      sessions as any,
      users as any,
    );
    response = { cookie: jest.fn(), clearCookie: jest.fn() };
  });

  describe('login', () => {
    it('issues an access token that names the session', async () => {
      await service.login(user, response as unknown as Response);

      const [, token] = cookie(ACCESS_COOKIE)!;
      expect(jwtService.verify(token)).toMatchObject({ userId: 3, sid: 7 });
    });

    it('sets the access cookie HTTPS-only and SameSite=Lax', async () => {
      await service.login(user, response as unknown as Response);

      expect(cookie(ACCESS_COOKIE)![2]).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
    });

    it('scopes the refresh cookie to /auth and the session lifetime', async () => {
      await service.login(user, response as unknown as Response);

      expect(cookie(REFRESH_COOKIE)).toEqual([
        REFRESH_COOKIE,
        '7.new',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          path: '/auth',
          expires: session.expiresAt,
        }),
      ]);
    });
  });

  it('rotates the refresh token and returns the user', async () => {
    const result = await service.refresh(
      request({ [REFRESH_COOKIE]: '7.old' }),
      response as unknown as Response,
    );

    expect(sessions.rotate).toHaveBeenCalledWith('7.old');
    expect(cookie(REFRESH_COOKIE)![1]).toBe('7.next');
    expect(result).toBe(user);
  });

  describe('logout', () => {
    it('ends the session named by a valid access token, even without the refresh cookie', async () => {
      const token = await jwtService.signAsync({ userId: 3, sid: 7 });

      await service.logout(
        request({ [ACCESS_COOKIE]: token }),
        response as unknown as Response,
      );

      expect(sessions.end).toHaveBeenCalledWith(7);
    });

    it('ignores an access token with a bad signature', async () => {
      const forged = await new JwtService({ secret: 'other' }).signAsync({
        userId: 1,
        sid: 1,
      });

      await service.logout(
        request({ [ACCESS_COOKIE]: forged }),
        response as unknown as Response,
      );

      expect(sessions.end).not.toHaveBeenCalled();
    });

    it('ends the session of the refresh cookie and clears both cookies', async () => {
      await service.logout(
        request({ [REFRESH_COOKIE]: '7.current' }),
        response as unknown as Response,
      );

      expect(sessions.endByRefreshToken).toHaveBeenCalledWith('7.current');
      expect(response.clearCookie).toHaveBeenCalledWith(
        ACCESS_COOKIE,
        expect.objectContaining({ path: '/' }),
      );
      expect(response.clearCookie).toHaveBeenCalledWith(
        REFRESH_COOKIE,
        expect.objectContaining({ path: '/auth' }),
      );
    });
  });

  it('ends every session on logout everywhere', async () => {
    await service.logoutEverywhere(user, response as unknown as Response);

    expect(sessions.endAll).toHaveBeenCalledWith(3);
  });
});
