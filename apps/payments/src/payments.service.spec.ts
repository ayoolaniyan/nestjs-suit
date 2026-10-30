import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { NOTIFICATION_SERVICE } from '@app/common';
import { PaymentsService } from './payments.service';

const paymentIntentsCreate = jest.fn();
const refundsCreate = jest.fn();

jest.mock('stripe', () => {
  class StripeError extends Error {}
  class StripeCardError extends StripeError {}
  class StripeInvalidRequestError extends StripeError {}
  class StripeIdempotencyError extends StripeError {}
  const Stripe = Object.assign(
    jest.fn().mockImplementation(() => ({
      paymentIntents: { create: paymentIntentsCreate },
      refunds: { create: refundsCreate },
    })),
    {
      errors: {
        StripeError,
        StripeCardError,
        StripeInvalidRequestError,
        StripeIdempotencyError,
      },
    },
  );
  return { Stripe };
});

// Resolved after jest.mock so these are the mocked classes.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Stripe } = require('stripe');

describe('PaymentsService', () => {
  let service: PaymentsService;
  let notifications: { emit: jest.Mock };

  const charge = {
    amountCents: 500,
    email: 'user@example.com',
    paymentMethodId: 'pm_from_client',
  };

  beforeEach(async () => {
    paymentIntentsCreate.mockReset();
    paymentIntentsCreate.mockResolvedValue({ id: 'pi_123' });
    refundsCreate.mockReset();
    notifications = { emit: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'sk_test_dummy' },
        },
        { provide: NOTIFICATION_SERVICE, useValue: notifications },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
  });

  it('charges the payment method the client supplied', async () => {
    await service.createCharge(charge);

    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method: 'pm_from_client' }),
      expect.anything(),
    );
  });

  it('charges the amount in cents as given', async () => {
    await service.createCharge({ ...charge, amountCents: 1999 });

    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1999 }),
      expect.anything(),
    );
  });

  it('forwards the idempotency key to Stripe', async () => {
    await service.createCharge({ ...charge, idempotencyKey: 'key-1' });

    expect(paymentIntentsCreate).toHaveBeenCalledWith(expect.anything(), {
      idempotencyKey: 'key-1',
    });
  });

  it('notifies the customer once the charge succeeds', async () => {
    await service.createCharge(charge);

    expect(notifications.emit).toHaveBeenCalledWith('notify_email', {
      email: 'user@example.com',
      text: 'Your payment of $5.00 has completed successfully.',
    });
  });

  it('reports a declined card as a 402 and sends no notification', async () => {
    paymentIntentsCreate.mockRejectedValue(
      new Stripe.errors.StripeCardError('Your card was declined.'),
    );

    const error = await service.createCharge(charge).catch((e) => e);

    expect(error).toBeInstanceOf(RpcException);
    expect(error.getError()).toEqual({
      status: 402,
      message: 'Your card was declined.',
    });
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('reports a reused idempotency key as a 409', async () => {
    paymentIntentsCreate.mockRejectedValue(
      new Stripe.errors.StripeIdempotencyError('Keys reused.'),
    );

    const error = await service.createCharge(charge).catch((e) => e);

    expect(error.getError()).toMatchObject({ status: 409 });
  });

  it('does not leak unexpected provider errors to the caller', async () => {
    paymentIntentsCreate.mockRejectedValue(new Error('socket hang up'));

    const error = await service.createCharge(charge).catch((e) => e);

    expect(error.getError()).toEqual({
      status: 502,
      message: 'Payment provider error',
    });
  });

  it('refunds a payment intent under the given idempotency key', async () => {
    await service.refundCharge({
      paymentIntentId: 'pi_123',
      idempotencyKey: 'reservation-5-refund',
    });

    expect(refundsCreate).toHaveBeenCalledWith(
      { payment_intent: 'pi_123' },
      { idempotencyKey: 'reservation-5-refund' },
    );
  });
});
