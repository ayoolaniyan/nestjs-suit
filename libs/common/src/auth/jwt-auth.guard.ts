import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Inject,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { ClientProxy } from '@nestjs/microservices';
import { Reflector } from '@nestjs/core';
import { AUTH_SERVICE } from '../constants/services';
import { User } from '../models/user.entity';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    @Inject(AUTH_SERVICE) private readonly authClient: ClientProxy,
    private readonly reflector: Reflector,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();

    // Node lower-cases every incoming header name, so `headers.Authentication`
    // was always undefined and only the cookie path ever worked.
    const jwt =
      request.cookies?.Authentication ?? request.headers?.authentication;

    if (!jwt) {
      return false;
    }

    const requiredRoles = this.reflector.get<string[]>(
      'roles',
      context.getHandler(),
    );

    return this.authClient
      .send<User>('authenticate', { Authentication: jwt })
      .pipe(
        tap((user) => {
          if (requiredRoles?.length) {
            const held = user.roles?.map((role) => role.name) ?? [];
            const missing = requiredRoles.filter(
              (role) => !held.includes(role),
            );

            if (missing.length > 0) {
              // Logged without the token or the user's identity: an
              // authorisation failure is not a reason to put credentials in
              // the log stream.
              this.logger.warn(
                `Request rejected, missing role(s): ${missing.join(', ')}`,
              );
              throw new UnauthorizedException();
            }
          }
          request.user = user;
        }),
        map(() => true),
        catchError((error) => {
          this.logger.warn(`Authentication failed: ${error?.message}`);
          return of(false);
        }),
      );
  }
}
