import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { UsersService } from '../users/users.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly userService: UsersService) {
    super({ usernameField: 'email' });
  }

  // verifyUser already throws a generic UnauthorizedException for bad
  // credentials. Wrapping every error in one, as before, passed the
  // underlying error (e.g. "Entity not found") to the client and turned a
  // database outage into a 401.
  async validate(email: string, password: string) {
    return this.userService.verifyUser(email, password);
  }
}
