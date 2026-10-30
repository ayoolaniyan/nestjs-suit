import { Injectable } from '@nestjs/common';
import { User } from '@app/common';
import { CookieOptions, Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenPayload } from './interfaces/token-payload.interface';
import { IssuedSession, SessionsService } from './sessions/sessions.service';
import { UsersService } from './users/users.service';

export const ACCESS_COOKIE = 'Authentication';
export const REFRESH_COOKIE = 'Refresh';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly sessionsService: SessionsService,
    private readonly usersService: UsersService,
  ) {}

  async login(user: User, response: Response) {
    const issued = await this.sessionsService.start(user.id);
    await this.setCookies(issued, response);
  }

  /** New access and refresh tokens for the session the refresh token names. */
  async refresh(request: Request, response: Response) {
    const issued = await this.sessionsService.rotate(
      request.cookies?.[REFRESH_COOKIE],
    );
    await this.setCookies(issued, response);
    return this.usersService.getUser({ id: issued.session.userId });
  }

  /**
   * Ends the caller's session and clears the cookies. Works with either
   * cookie, since the access token may already have expired; with neither,
   * there is nothing to end and it still succeeds.
   */
  async logout(request: Request, response: Response) {
    await this.sessionsService.endByRefreshToken(
      request.cookies?.[REFRESH_COOKIE],
    );
    const payload = await this.verifiedPayload(
      request.cookies?.[ACCESS_COOKIE],
    );
    if (payload?.sid) {
      await this.sessionsService.end(payload.sid);
    }
    this.clearCookies(response);
  }

  /** Ends every session the user has, on every device. */
  async logoutEverywhere(user: User, response: Response) {
    await this.sessionsService.endAll(user.id);
    this.clearCookies(response);
  }

  private async setCookies(
    { session, refreshToken }: IssuedSession,
    response: Response,
  ) {
    const tokenPayload: TokenPayload = {
      userId: session.userId,
      sid: session.id,
    };
    const expires = new Date();
    expires.setSeconds(
      expires.getSeconds() +
        this.configService.getOrThrow<number>('JWT_EXPIRATION'),
    );
    const token = await this.jwtService.signAsync(tokenPayload, {
      secret: this.configService.get<string>('JWT_SECRET'),
    });

    response.cookie(ACCESS_COOKIE, token, {
      ...this.accessCookieOptions(),
      expires,
    });
    response.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.refreshCookieOptions(),
      expires: session.expiresAt,
    });
  }

  private clearCookies(response: Response) {
    response.clearCookie(ACCESS_COOKIE, this.accessCookieOptions());
    response.clearCookie(REFRESH_COOKIE, this.refreshCookieOptions());
  }

  private accessCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secureCookies(),
      // Not sent on cross-site POSTs, which is what stops another site from
      // making bookings with the user's cookie (CSRF).
      sameSite: 'lax',
      path: '/',
    };
  }

  private refreshCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secureCookies(),
      sameSite: 'strict',
      // Sent only to the auth endpoints, never to the other services.
      path: '/auth',
    };
  }

  /** HTTPS-only cookies, unless COOKIE_SECURE says otherwise. */
  private secureCookies() {
    return (
      this.configService.get<boolean>('COOKIE_SECURE') ??
      this.configService.get<string>('NODE_ENV') === 'production'
    );
  }

  private async verifiedPayload(token: unknown): Promise<TokenPayload | null> {
    if (typeof token !== 'string') {
      return null;
    }
    return this.jwtService
      .verifyAsync<TokenPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      })
      .catch(() => null);
  }
}
