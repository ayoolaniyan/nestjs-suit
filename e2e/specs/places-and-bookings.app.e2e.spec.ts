import {
  RESERVATIONS,
  day,
  json,
  makeAdmin,
  signUpAndLogIn,
  sql,
} from './helpers';

const PRICE = 12500;

/** An admin, and a place they listed. */
async function placeListedByAdmin() {
  const admin = await signUpAndLogIn();
  await makeAdmin(admin.login.id);

  const created = await fetch(
    `${RESERVATIONS}/places`,
    json(
      { name: 'Lakeside cabin', pricePerNightCents: PRICE },
      { cookie: admin.cookie },
    ),
  );
  expect(created.status).toBe(201);
  return { admin, place: await created.json() };
}

/** A confirmed stay, inserted directly: confirming one needs a real charge. */
async function confirmedStay(
  placeId: number,
  userId: number,
  startDate: string,
  endDate: string,
) {
  const result = await sql<{ insertId: number }>(
    `INSERT INTO reservation (startDate, endDate, userId, placeId, status, amountCents, invoiceId)
     VALUES (?, ?, ?, ?, 'confirmed', ?, 'pi_e2e')`,
    [startDate, endDate, userId, placeId, PRICE],
  );
  return result.insertId;
}

const book = (
  cookie: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) =>
  fetch(
    `${RESERVATIONS}/reservations`,
    json({ paymentMethodId: 'pm_card_visa', ...body }, { cookie, ...headers }),
  );

describe('places', () => {
  test('only an admin can list a place', async () => {
    const { cookie } = await signUpAndLogIn();

    const response = await fetch(
      `${RESERVATIONS}/places`,
      json({ name: 'Nope', pricePerNightCents: PRICE }, { cookie }),
    );

    expect(response.status).toBe(403);
  });

  test('anyone can browse a listed place', async () => {
    const { place } = await placeListedByAdmin();

    const one = await fetch(`${RESERVATIONS}/places/${place.id}`);
    expect(one.status).toBe(200);
    expect(await one.json()).toMatchObject({
      name: 'Lakeside cabin',
      pricePerNightCents: PRICE,
    });

    const all = await (await fetch(`${RESERVATIONS}/places`)).json();
    expect(all.map((p: { id: number }) => p.id)).toContain(place.id);
  });

  test('refuses a price below the Stripe minimum', async () => {
    const admin = await signUpAndLogIn();
    await makeAdmin(admin.login.id);

    const response = await fetch(
      `${RESERVATIONS}/places`,
      json({ name: 'Cheap', pricePerNightCents: 10 }, { cookie: admin.cookie }),
    );

    expect(response.status).toBe(400);
  });
});

describe('availability and booking', () => {
  test('reports booked stays and refuses an overlapping booking', async () => {
    const { place } = await placeListedByAdmin();
    const guest = await signUpAndLogIn();
    await confirmedStay(place.id, guest.login.id, day(10), day(13));

    const availability = await (
      await fetch(
        `${RESERVATIONS}/places/${place.id}/availability?from=${day(1)}&to=${day(30)}`,
      )
    ).json();
    expect(availability.available).toBe(false);
    expect(availability.booked).toHaveLength(1);
    expect(availability.booked[0]).not.toHaveProperty('userId');

    const other = await signUpAndLogIn();
    const overlapping = await book(other.cookie, {
      placeId: place.id,
      startDate: day(11),
      endDate: day(12),
    });
    expect(overlapping.status).toBe(409);
  });

  test('lets the next stay check in on the previous check-out day, priced by the server', async () => {
    const { place } = await placeListedByAdmin();
    const guest = await signUpAndLogIn();
    await confirmedStay(place.id, guest.login.id, day(10), day(13));

    const other = await signUpAndLogIn();
    const adjacent = await book(other.cookie, {
      placeId: place.id,
      startDate: day(13),
      endDate: day(15),
      // Ignored: the amount is no longer the client's to choose.
      amountCents: 50,
    });

    // Not 409: the dates were free. The stack has no real Stripe key, so the
    // charge itself fails upstream.
    expect(adjacent.status).toBe(502);

    const [mine] = await (
      await fetch(`${RESERVATIONS}/reservations`, {
        headers: { cookie: other.cookie },
      })
    ).json();
    expect(mine).toMatchObject({
      placeId: place.id,
      status: 'pending',
      amountCents: 2 * PRICE,
    });
  });

  test('a retried Idempotency-Key does not book twice', async () => {
    const { place } = await placeListedByAdmin();
    const guest = await signUpAndLogIn();
    const attempt = () =>
      book(
        guest.cookie,
        { placeId: place.id, startDate: day(20), endDate: day(22) },
        { 'idempotency-key': `e2e-${crypto.randomUUID()}` },
      );
    const key = `e2e-${crypto.randomUUID()}`;
    const withKey = () =>
      book(
        guest.cookie,
        { placeId: place.id, startDate: day(20), endDate: day(22) },
        { 'idempotency-key': key },
      );

    expect((await withKey()).status).toBe(502);
    // Same key: replays the pending attempt rather than colliding with it.
    expect((await withKey()).status).toBe(502);
    // A different key is a new booking, and the dates are still held.
    expect((await attempt()).status).toBe(409);

    const mine = await (
      await fetch(`${RESERVATIONS}/reservations`, {
        headers: { cookie: guest.cookie },
      })
    ).json();
    expect(mine).toHaveLength(1);
  });

  test('refuses dates with a time of day', async () => {
    const { place } = await placeListedByAdmin();
    const guest = await signUpAndLogIn();

    const response = await book(guest.cookie, {
      placeId: place.id,
      startDate: `${day(5)}T12:00:00Z`,
      endDate: day(7),
    });

    expect(response.status).toBe(400);
  });

  test('answers 404 for an unknown place', async () => {
    const guest = await signUpAndLogIn();

    const response = await book(guest.cookie, {
      placeId: 999999,
      startDate: day(5),
      endDate: day(7),
    });

    expect(response.status).toBe(404);
  });
});

describe('cancellation', () => {
  test('refuses to cancel a booking that is not confirmed', async () => {
    const { place } = await placeListedByAdmin();
    const guest = await signUpAndLogIn();
    await book(guest.cookie, {
      placeId: place.id,
      startDate: day(40),
      endDate: day(41),
    });
    const [pending] = await (
      await fetch(`${RESERVATIONS}/reservations`, {
        headers: { cookie: guest.cookie },
      })
    ).json();

    const response = await fetch(
      `${RESERVATIONS}/reservations/${pending.id}/cancel`,
      { method: 'POST', headers: { cookie: guest.cookie } },
    );

    expect(response.status).toBe(409);
  });

  test("cannot cancel someone else's reservation", async () => {
    const { place } = await placeListedByAdmin();
    const guest = await signUpAndLogIn();
    const id = await confirmedStay(place.id, guest.login.id, day(50), day(52));

    const stranger = await signUpAndLogIn();
    const response = await fetch(`${RESERVATIONS}/reservations/${id}/cancel`, {
      method: 'POST',
      headers: { cookie: stranger.cookie },
    });

    expect(response.status).toBe(404);
  });

  test('keeps a booking confirmed when the refund cannot be made', async () => {
    const { place } = await placeListedByAdmin();
    const guest = await signUpAndLogIn();
    const id = await confirmedStay(place.id, guest.login.id, day(60), day(62));

    const response = await fetch(`${RESERVATIONS}/reservations/${id}/cancel`, {
      method: 'POST',
      headers: { cookie: guest.cookie },
    });
    // No real Stripe key in this stack, so the refund fails upstream.
    expect(response.status).toBe(502);

    const reservation = await (
      await fetch(`${RESERVATIONS}/reservations/${id}`, {
        headers: { cookie: guest.cookie },
      })
    ).json();
    expect(reservation.status).toBe('confirmed');
  });
});

describe('observability and docs', () => {
  test('echoes the caller’s request id', async () => {
    const response = await fetch(`${RESERVATIONS}/places`, {
      headers: { 'x-request-id': 'e2e-trace-1' },
    });

    expect(response.headers.get('x-request-id')).toBe('e2e-trace-1');
  });

  test('issues a request id when none is sent', async () => {
    const response = await fetch(`${RESERVATIONS}/places`);

    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('exposes Prometheus metrics, including calls to payments', async () => {
    const body = await (await fetch(`${RESERVATIONS}/metrics`)).text();

    expect(body).toContain('http_request_duration_seconds');
    expect(body).toMatch(/rpc_client_duration_seconds_count\{pattern="create_charge"/);
    expect(body).toMatch(/rpc_client_duration_seconds_count\{pattern="authenticate"/);
  });

  test('publishes an OpenAPI document without a client-chosen amount', async () => {
    const document = await (
      await fetch(`${RESERVATIONS}/reservations/docs-json`)
    ).json();

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/places',
        '/places/{id}/availability',
        '/reservations/{id}/cancel',
      ]),
    );
    const booking = document.components.schemas.CreateReservationDto;
    expect(booking.required).toEqual(
      expect.arrayContaining(['placeId', 'startDate', 'endDate', 'paymentMethodId']),
    );
    expect(booking.properties).not.toHaveProperty('amountCents');
  });
});
