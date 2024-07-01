import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { TokenPayload } from '../interfaces/token-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly userService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: any) =>
          request?.Authentication ||
          request?.cookies?.Authentication ||
          request?.headers.Authentication,
      ]),
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }
  async validate({ userId }: TokenPayload) {
    if (!userId) {
      throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
    }
    return this.userService.getUser({ _id: userId });
  }
}
