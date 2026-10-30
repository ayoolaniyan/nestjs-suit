import {
  AUTH,
  RESERVATIONS,
  cookieFrom,
  json,
  randomPassword,
  signUpAndLogIn,
  uniqueEmail,
} from './helpers';

const refresh = (refreshCookie: string) =>
  fetch(`${AUTH}/auth/refresh`, {
    method: 'POST',
    headers: { cookie: refreshCookie },
  });

const reservationsWith = (cookie: string) =>
  fetch(`${RESERVATIONS}/reservations`, { headers: { cookie } });

describe('sessions', () => {
  test('a refresh issues new cookies that work', async () => {
    const { refreshCookie } = await signUpAndLogIn();

    const response = await refresh(refreshCookie);

    expect(response.status).toBe(200);
    const cookie = cookieFrom(response, 'Authentication')!;
    expect(cookieFrom(response, 'Refresh')).not.toBe(refreshCookie);
    expect((await reservationsWith(cookie)).status).toBe(200);
  });

  test('scopes the refresh cookie to the auth endpoints', async () => {
    const credentials = { email: uniqueEmail(), password: randomPassword() };
    await fetch(`${AUTH}/users`, json(credentials));

    const login = await fetch(`${AUTH}/auth/login`, json(credentials));
    const refreshCookie = login.headers
      .getSetCookie()
      .find((value) => value.startsWith('Refresh='))!;

    expect(refreshCookie).toMatch(/Path=\/auth/);
    expect(refreshCookie).toMatch(/HttpOnly/);
    expect(refreshCookie).toMatch(/SameSite=Strict/);
  });

  test('replaying a used refresh token ends the session', async () => {
    const { cookie, refreshCookie } = await signUpAndLogIn();
    const rotated = await refresh(refreshCookie);
    const latest = cookieFrom(rotated, 'Refresh')!;

    // The first token again: someone else holds a copy.
    expect((await refresh(refreshCookie)).status).toBe(401);

    // So nobody keeps the session, not even the holder of the newest token.
    expect((await refresh(latest)).status).toBe(401);
    expect((await reservationsWith(cookie)).status).toBe(401);
  });

  test('logout rejects the access token at once, not when it expires', async () => {
    const { cookie, refreshCookie } = await signUpAndLogIn();
    expect((await reservationsWith(cookie)).status).toBe(200);

    const logout = await fetch(`${AUTH}/auth/logout`, {
      method: 'POST',
      headers: { cookie: `${cookie}; ${refreshCookie}` },
    });

    expect(logout.status).toBe(204);
    expect(cookieFrom(logout, 'Authentication')).toBe('Authentication=');
    expect((await reservationsWith(cookie)).status).toBe(401);
    expect((await refresh(refreshCookie)).status).toBe(401);
  });

  test('logout everywhere ends the sessions on other devices', async () => {
    const phone = await signUpAndLogIn();
    const laptopLogin = await fetch(
      `${AUTH}/auth/login`,
      json(phone.credentials),
    );
    const laptop = cookieFrom(laptopLogin, 'Authentication')!;

    const response = await fetch(`${AUTH}/auth/logout-all`, {
      method: 'POST',
      headers: { cookie: phone.cookie },
    });

    expect(response.status).toBe(204);
    expect((await reservationsWith(laptop)).status).toBe(401);
    expect((await reservationsWith(phone.cookie)).status).toBe(401);
  });
});

describe('security', () => {
  test('limits login attempts per account and address', async () => {
    const { credentials } = await signUpAndLogIn();
    const wrong = { ...credentials, password: randomPassword() };

    // signUpAndLogIn used one of the ten attempts.
    for (let attempt = 2; attempt <= 10; attempt++) {
      expect((await fetch(`${AUTH}/auth/login`, json(wrong))).status).toBe(
        401,
      );
    }
    const blocked = await fetch(`${AUTH}/auth/login`, json(credentials));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after-login')).toBeTruthy();

    // Another account from the same address is unaffected.
    expect((await signUpAndLogIn()).login.id).toBeDefined();
  });

  test.each([
    ['auth', `${AUTH}/users`],
    ['reservations', `${RESERVATIONS}/places`],
  ])('%s sends security headers', async (_name, url) => {
    const response = await fetch(url);

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-powered-by')).toBeNull();
  });

  test('allows no cross-origin callers unless configured', async () => {
    const response = await fetch(`${RESERVATIONS}/places`, {
      headers: { origin: 'https://evil.example.com' },
    });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('errors share one shape, with the request id', async () => {
    const response = await fetch(`${RESERVATIONS}/places/999999`, {
      headers: { 'x-request-id': 'e2e-error-1' },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: expect.any(String),
      requestId: 'e2e-error-1',
    });
  });
});
