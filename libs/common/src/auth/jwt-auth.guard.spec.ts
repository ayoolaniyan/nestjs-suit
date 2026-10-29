import {
  ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import {
  Observable,
  TimeoutError,
  firstValueFrom,
  isObservable,
  of,
  throwError,
} from 'rxjs';
import { JwtAuthGuard } from './jwt-auth.guard';

type RequestLike = {
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  user?: unknown;
};

function contextFor(request: RequestLike): ExecutionContext {
  return {
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

async function resolve(
  result: boolean | Promise<boolean> | Observable<boolean>,
): Promise<boolean> {
  return isObservable(result) ? firstValueFrom(result) : result;
}

describe('JwtAuthGuard', () => {
  let authClient: { send: jest.Mock };
  let reflector: Reflector;
  let guard: JwtAuthGuard;

  const user = { id: 1, email: 'user@example.com', roles: [{ name: 'admin' }] };

  beforeEach(() => {
    authClient = { send: jest.fn().mockReturnValue(of(user)) };
    reflector = new Reflector();
    guard = new JwtAuthGuard(authClient as unknown as ClientProxy, reflector);
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);
  });

  it('accepts a token supplied as a cookie', async () => {
    const result = await resolve(
      guard.canActivate(contextFor({ cookies: { Authentication: 'token' } })),
    );

    expect(result).toBe(true);
    expect(authClient.send).toHaveBeenCalledWith('authenticate', {
      Authentication: 'token',
    });
  });

  it('accepts a token supplied as a header', async () => {
    // Node lower-cases incoming header names. Reading `headers.Authentication`
    // meant header-based callers were silently rejected.
    const result = await resolve(
      guard.canActivate(contextFor({ headers: { authentication: 'token' } })),
    );

    expect(result).toBe(true);
  });

  it('answers 401 to a request carrying no token, without calling the auth service', () => {
    expect(() => guard.canActivate(contextFor({}))).toThrow(
      UnauthorizedException,
    );
    expect(authClient.send).not.toHaveBeenCalled();
  });

  it('attaches the resolved user to the request', async () => {
    const request: RequestLike = { cookies: { Authentication: 'token' } };
    await resolve(guard.canActivate(contextFor(request)));

    expect(request.user).toEqual(user);
  });

  it('answers 403 to a user missing a required role', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue(['superadmin']);

    await expect(
      resolve(
        guard.canActivate(contextFor({ cookies: { Authentication: 'token' } })),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a user holding every required role', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue(['admin']);

    const result = await resolve(
      guard.canActivate(contextFor({ cookies: { Authentication: 'token' } })),
    );

    expect(result).toBe(true);
  });

  it('answers 401 when the auth service refuses the token', async () => {
    // RPC error replies arrive as plain objects, not Error instances.
    authClient.send.mockReturnValue(
      throwError(() => ({ status: 'error', message: 'Unauthorized' })),
    );

    await expect(
      resolve(
        guard.canActivate(contextFor({ cookies: { Authentication: 'token' } })),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('answers 503 when the auth service cannot be reached', async () => {
    authClient.send.mockReturnValue(
      throwError(() =>
        Object.assign(new Error('connect ECONNREFUSED'), {
          code: 'ECONNREFUSED',
        }),
      ),
    );

    await expect(
      resolve(
        guard.canActivate(contextFor({ cookies: { Authentication: 'token' } })),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('answers 503 when the auth service times out', async () => {
    authClient.send.mockReturnValue(throwError(() => new TimeoutError()));

    await expect(
      resolve(
        guard.canActivate(contextFor({ cookies: { Authentication: 'token' } })),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
