import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { TokenPayload } from '../interfaces/token-payload.interface';
import { SessionsService } from '../sessions/sessions.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly userService: UsersService,
    private readonly sessionsService: SessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // `headers.authentication` in lower case: Node normalises incoming
        // header names, so the capitalised form never matched.
        (request: any) =>
          request?.Authentication ??
          request?.cookies?.Authentication ??
          request?.headers?.authentication,
      ]),
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  /**
   * A valid signature is not enough: the token's session must still be
   * active, so logging out rejects the token immediately. Tokens issued
   * before sessions existed carry no `sid` and are refused.
   */
  async validate({ userId, sid }: TokenPayload) {
    if (
      !userId ||
      !sid ||
      !(await this.sessionsService.isActive(sid, userId))
    ) {
      throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
    }
    return this.userService.getUser({ id: userId });
  }
}
