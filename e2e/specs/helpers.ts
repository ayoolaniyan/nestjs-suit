import { createHmac } from 'crypto';
import { createConnection } from 'mysql2/promise';

export const AUTH = 'http://auth:3001';
export const RESERVATIONS = 'http://reservations:3000';
export const PAYMENTS = 'http://payments:3006';
export const MAILPIT = 'http://mailpit:8025';

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

/** `name=value` of a cookie the response sets, or undefined. */
export const cookieFrom = (response: Response, name: string) =>
  response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${name}=`))
    ?.split(';')[0];

export const uniqueEmail = () =>
  `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

/**
 * Signs up a fresh user and logs in. `cookie` is the Authentication cookie,
 * `refreshCookie` the Refresh one.
 */
export async function signUpAndLogIn(extra: Record<string, unknown> = {}) {
  const credentials = {
    email: uniqueEmail(),
    password: randomPassword(),
  };

  const signup = await fetch(`${AUTH}/users`, json({ ...credentials, ...extra }));
  expect(signup.status).toBe(201);

  const login = await fetch(`${AUTH}/auth/login`, json(credentials));
  expect(login.status).toBe(201);

  const cookie = cookieFrom(login, 'Authentication');
  const refreshCookie = cookieFrom(login, 'Refresh');
  expect(cookie).toBeDefined();
  expect(refreshCookie).toBeDefined();

  return {
    credentials,
    signup: await signup.json(),
    login: await login.json(),
    cookie: cookie!,
    refreshCookie: refreshCookie!,
  };
}

/**
 * Posts a webhook to payments as Stripe would, signed with the stack's
 * webhook secret: `t=<timestamp>,v1=<HMAC-SHA256 of "<timestamp>.<body>">`.
 */
export async function deliverStripeEvent(
  type: string,
  object: Record<string, unknown>,
  secret = process.env.STRIPE_WEBHOOK_SECRET!,
) {
  const body = JSON.stringify({
    id: `evt_e2e_${crypto.randomUUID()}`,
    object: 'event',
    type,
    data: { object },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return fetch(`${PAYMENTS}/payments/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': `t=${timestamp},v1=${signature}`,
    },
    body,
  });
}

interface MailpitMessage {
  Subject: string;
  To: { Address: string }[];
}

/** Polls Mailpit until an email to `to` arrives, then returns them all. */
export async function emailsTo(
  to: string,
  { atLeast = 1, timeoutMs = 15_000 } = {},
): Promise<MailpitMessage[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const { messages } = (await response.json()) as {
      messages: MailpitMessage[];
    };
    if (messages.length >= atLeast || Date.now() > deadline) {
      return messages;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
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
