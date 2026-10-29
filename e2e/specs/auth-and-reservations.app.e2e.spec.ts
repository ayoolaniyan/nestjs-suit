const AUTH = 'http://auth:3001';
const RESERVATIONS = 'http://reservations:3000';

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** Signs up a fresh user and returns the Authentication cookie from login. */
async function signUpAndLogIn(extra: Record<string, unknown> = {}) {
  const credentials = {
    email: `user-${Date.now()}-${Math.random()}@example.com`,
    password: 'Str0ng!Passw0rd',
  };

  const signup = await fetch(`${AUTH}/users`, json({ ...credentials, ...extra }));
  expect(signup.status).toBe(201);

  const login = await fetch(`${AUTH}/auth/login`, json(credentials));
  expect(login.status).toBe(201);

  const cookie = login.headers
    .getSetCookie()
    .find((value) => value.startsWith('Authentication='));
  expect(cookie).toBeDefined();

  return {
    credentials,
    signup: await signup.json(),
    login: await login.json(),
    cookie: cookie!.split(';')[0],
  };
}

describe('auth', () => {
  test('never returns the password hash', async () => {
    const { signup, login, cookie } = await signUpAndLogIn();

    const me = await fetch(`${AUTH}/users`, { headers: { cookie } });
    expect(me.status).toBe(200);

    for (const user of [signup, login, await me.json()]) {
      expect(user).not.toHaveProperty('password');
    }
  });

  test('ignores roles supplied at signup', async () => {
    const { login } = await signUpAndLogIn({ roles: [{ name: 'Admin' }] });

    expect(login.roles).toEqual([]);
  });

  test('refuses a duplicate email', async () => {
    const { credentials } = await signUpAndLogIn();

    const again = await fetch(`${AUTH}/users`, json(credentials));
    expect(again.status).toBe(422);
  });

  test('gives the same answer for an unknown email and a wrong password', async () => {
    const { credentials } = await signUpAndLogIn();

    const wrongPassword = await fetch(
      `${AUTH}/auth/login`,
      json({ ...credentials, password: 'Wr0ng!Passw0rd' }),
    );
    const unknownEmail = await fetch(
      `${AUTH}/auth/login`,
      json({ ...credentials, email: 'nobody@example.com' }),
    );

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(await unknownEmail.json()).toEqual(await wrongPassword.json());
  });
});

describe('reservations', () => {
  test('answers 401 without a token', async () => {
    const response = await fetch(`${RESERVATIONS}/reservations`);
    expect(response.status).toBe(401);
  });

  test('authenticates through the auth service and lists only own reservations', async () => {
    const { cookie } = await signUpAndLogIn();

    const response = await fetch(`${RESERVATIONS}/reservations`, {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("answers 404 for a reservation that is not the caller's", async () => {
    const { cookie } = await signUpAndLogIn();

    const response = await fetch(`${RESERVATIONS}/reservations/1`, {
      headers: { cookie },
    });

    expect(response.status).toBe(404);
  });

  test('answers 403 to a non-admin deleting', async () => {
    const { cookie } = await signUpAndLogIn();

    const response = await fetch(`${RESERVATIONS}/reservations/1`, {
      method: 'DELETE',
      headers: { cookie },
    });

    expect(response.status).toBe(403);
  });

  test('rejects an end date before the start date without charging', async () => {
    const { cookie } = await signUpAndLogIn();
    const start = new Date(Date.now() + 2 * 86_400_000);
    const end = new Date(Date.now() + 86_400_000);

    const response = await fetch(`${RESERVATIONS}/reservations`, {
      ...json({
        startDate: start,
        endDate: end,
        charge: { amount: 20, paymentMethodId: 'pm_card_visa' },
      }),
      headers: { 'content-type': 'application/json', cookie },
    });

    expect(response.status).toBe(400);
  });

  test('rejects a non-numeric id', async () => {
    const { cookie } = await signUpAndLogIn();

    const response = await fetch(`${RESERVATIONS}/reservations/abc`, {
      headers: { cookie },
    });

    expect(response.status).toBe(400);
  });
});
