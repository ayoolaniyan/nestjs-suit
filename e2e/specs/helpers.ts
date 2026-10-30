import { createConnection } from 'mysql2/promise';

export const AUTH = 'http://auth:3001';
export const RESERVATIONS = 'http://reservations:3000';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A fresh password per call, generated rather than written out so that no
 * credential-shaped literal sits in the repository. The prefix supplies the
 * uppercase letter, digit and symbol that IsStrongPassword requires; the UUID
 * supplies length and lowercase.
 */
export const randomPassword = () => `A1!${crypto.randomUUID()}`;

/** YYYY-MM-DD, `days` from today (UTC). */
export const day = (days: number) =>
  new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);

export const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

/** Signs up a fresh user and returns the Authentication cookie from login. */
export async function signUpAndLogIn(extra: Record<string, unknown> = {}) {
  const credentials = {
    email: `user-${Date.now()}-${Math.random()}@example.com`,
    password: randomPassword(),
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

/**
 * Direct database access, for state the API deliberately cannot create:
 * granting admin, and confirmed bookings, which need a real Stripe charge.
 */
export async function sql<T = unknown>(
  query: string,
  params: unknown[] = [],
): Promise<T> {
  const connection = await createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
  });
  try {
    const [rows] = await connection.query(query, params);
    return rows as T;
  } finally {
    await connection.end();
  }
}

export async function makeAdmin(userId: number) {
  await sql(
    "INSERT INTO user_roles_role (userId, roleId) SELECT ?, id FROM role WHERE name = 'Admin'",
    [userId],
  );
}
