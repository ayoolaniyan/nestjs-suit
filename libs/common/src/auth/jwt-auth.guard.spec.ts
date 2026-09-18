import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import { Observable, firstValueFrom, isObservable, of, throwError } from 'rxjs';
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

  it('rejects a request carrying no token without calling the auth service', async () => {
    const result = await resolve(guard.canActivate(contextFor({})));

    expect(result).toBe(false);
    expect(authClient.send).not.toHaveBeenCalled();
  });

  it('attaches the resolved user to the request', async () => {
    const request: RequestLike = { cookies: { Authentication: 'token' } };
    await resolve(guard.canActivate(contextFor(request)));

    expect(request.user).toEqual(user);
  });

  it('denies a user missing a required role', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue(['superadmin']);

    const result = await resolve(
      guard.canActivate(contextFor({ cookies: { Authentication: 'token' } })),
    );

    expect(result).toBe(false);
  });

  it('allows a user holding every required role', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue(['admin']);

    const result = await resolve(
      guard.canActivate(contextFor({ cookies: { Authentication: 'token' } })),
    );

    expect(result).toBe(true);
  });

  it('denies the request when the auth service errors', async () => {
    authClient.send.mockReturnValue(
      throwError(() => new Error('auth service unavailable')),
    );

    const result = await resolve(
      guard.canActivate(contextFor({ cookies: { Authentication: 'token' } })),
    );

    expect(result).toBe(false);
  });
});
