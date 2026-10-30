import {
  RESERVATIONS,
  day,
  deliverStripeEvent,
  emailsTo,
  json,
  makeAdmin,
  signUpAndLogIn,
} from './helpers';

/**
 * The stack's Stripe key is fake, so every charge fails upstream and the
 * booking stays pending: exactly the "outcome unknown" case webhooks exist
 * for. The specs then play Stripe, delivering signed events.
 */
async function pendingBooking(startDays: number) {
  const admin = await signUpAndLogIn();
  await makeAdmin(admin.login.id);
  const place = await (
    await fetch(
      `${RESERVATIONS}/places`,
      json(
        { name: 'Harbour flat', pricePerNightCents: 9900 },
        { cookie: admin.cookie },
      ),
    )
  ).json();

  const guest = await signUpAndLogIn();
  const booking = await fetch(
    `${RESERVATIONS}/reservations`,
    json(
      {
        placeId: place.id,
        startDate: day(startDays),
        endDate: day(startDays + 2),
        paymentMethodId: 'pm_card_visa',
      },
      { cookie: guest.cookie },
    ),
  );
  expect(booking.status).toBe(502);

  const [reservation] = await (
    await fetch(`${RESERVATIONS}/reservations`, {
      headers: { cookie: guest.cookie },
    })
  ).json();
  expect(reservation.status).toBe('pending');
  return { guest, place, reservation };
}

const reservationOf = async (cookie: string, id: number) =>
  (
    await fetch(`${RESERVATIONS}/reservations/${id}`, { headers: { cookie } })
  ).json();

describe('Stripe webhooks', () => {
  test('a succeeded payment confirms the pending booking and emails the guest', async () => {
    const { guest, reservation } = await pendingBooking(70);

    const response = await deliverStripeEvent('payment_intent.succeeded', {
      id: 'pi_e2e_succeeded',
      object: 'payment_intent',
      metadata: { reservationId: String(reservation.id) },
    });

    expect(response.status).toBe(200);
    expect(await reservationOf(guest.cookie, reservation.id)).toMatchObject({
      status: 'confirmed',
      invoiceId: 'pi_e2e_succeeded',
    });

    const [email] = await emailsTo(guest.credentials.email);
    expect(email?.Subject).toBe(`Booking #${reservation.id} confirmed`);
  });

  test('a redelivered event changes nothing and sends no second email', async () => {
    const { guest, reservation } = await pendingBooking(80);
    const deliver = () =>
      deliverStripeEvent('payment_intent.succeeded', {
        id: 'pi_e2e_twice',
        object: 'payment_intent',
        metadata: { reservationId: String(reservation.id) },
      });

    expect((await deliver()).status).toBe(200);
    await emailsTo(guest.credentials.email);
    expect((await deliver()).status).toBe(200);

    // Give a duplicate time to arrive, were one sent.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(await emailsTo(guest.credentials.email)).toHaveLength(1);
  });

  test('a failed payment releases the dates', async () => {
    const { guest, place, reservation } = await pendingBooking(90);

    await deliverStripeEvent('payment_intent.payment_failed', {
      id: 'pi_e2e_failed',
      object: 'payment_intent',
      metadata: { reservationId: String(reservation.id) },
    });

    expect((await reservationOf(guest.cookie, reservation.id)).status).toBe(
      'failed',
    );
    const availability = await (
      await fetch(
        `${RESERVATIONS}/places/${place.id}/availability?from=${day(89)}&to=${day(93)}`,
      )
    ).json();
    expect(availability.booked).toEqual([]);
  });

  test('refuses an event that is not signed with the webhook secret', async () => {
    const { guest, reservation } = await pendingBooking(100);

    const response = await deliverStripeEvent(
      'payment_intent.succeeded',
      {
        id: 'pi_e2e_forged',
        object: 'payment_intent',
        metadata: { reservationId: String(reservation.id) },
      },
      'whsec_guessed',
    );

    expect(response.status).toBe(400);
    expect((await reservationOf(guest.cookie, reservation.id)).status).toBe(
      'pending',
    );
  });
});
