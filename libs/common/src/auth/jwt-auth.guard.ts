import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Inject,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Observable,
  TimeoutError,
  catchError,
  map,
  throwError,
  timeout,
} from 'rxjs';
import { ClientProxy } from '@nestjs/microservices';
import { Reflector } from '@nestjs/core';
import { AUTH_SERVICE } from '../constants/services';
import { User } from '../models/user.entity';

// Without a timeout a stalled auth service holds every authenticated request
// open indefinitely.
export const AUTH_TIMEOUT_MS = 5000;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    @Inject(AUTH_SERVICE) private readonly authClient: ClientProxy,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): Observable<boolean> | boolean {
    const request = context.switchToHttp().getRequest();

    const jwt =
      request.cookies?.Authentication ?? request.headers?.authentication;

    // Returning false would make Nest answer 403; an absent credential is a
    // 401.
    if (!jwt) {
      throw new UnauthorizedException();
    }

    const requiredRoles = this.reflector.get<string[]>(
      'roles',
      context.getHandler(),
    );

    return this.authClient
      .send<User>('authenticate', { Authentication: jwt })
      .pipe(
        timeout(AUTH_TIMEOUT_MS),
        catchError((error) => throwError(() => this.toHttpError(error))),
        // After catchError, so a missing role stays a 403 rather than being
        // folded into the authentication failure above.
        map((user) => {
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
              throw new ForbiddenException();
            }
          }
          request.user = user;
          return true;
        }),
      );
  }

  /**
   * A reply from the auth service means the token was refused. A timeout or a
   * socket error (which carries a `code` such as ECONNREFUSED) means the auth
   * service could not be asked, and the client should retry rather than log in
   * again.
   */
  private toHttpError(error: any) {
    if (error instanceof TimeoutError || typeof error?.code === 'string') {
      this.logger.error(`Auth service unreachable: ${error?.message}`);
      return new ServiceUnavailableException();
    }
    this.logger.warn(`Authentication failed: ${error?.message}`);
    return new UnauthorizedException();
  }
}
