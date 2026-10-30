import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import {
  PAYMENT_FAILED,
  PAYMENT_SUCCEEDED,
  RESERVATIONS_SERVICE,
} from '@app/common';
import { PaymentsService } from './payments.service';

const paymentIntentsCreate = jest.fn();
const refundsCreate = jest.fn();
const constructEvent = jest.fn();

jest.mock('stripe', () => {
  class StripeError extends Error {}
  class StripeCardError extends StripeError {}
  class StripeInvalidRequestError extends StripeError {}
  class StripeIdempotencyError extends StripeError {}
  const Stripe = Object.assign(
    jest.fn().mockImplementation(() => ({
      paymentIntents: { create: paymentIntentsCreate },
      refunds: { create: refundsCreate },
      webhooks: { constructEvent },
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
  let reservations: { send: jest.Mock };

  const charge = {
    amountCents: 500,
    paymentMethodId: 'pm_from_client',
    reservationId: 11,
  };

  beforeEach(async () => {
    paymentIntentsCreate.mockReset();
    paymentIntentsCreate.mockResolvedValue({ id: 'pi_123' });
    refundsCreate.mockReset();
    constructEvent.mockReset();
    reservations = { send: jest.fn().mockReturnValue(of({})) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: ConfigService,
          useValue: { getOrThrow: (key: string) => `${key}-value` },
        },
        { provide: RESERVATIONS_SERVICE, useValue: reservations },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
  });

  describe('createCharge', () => {
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

    it('records the reservation on the payment intent, for webhooks', async () => {
      await service.createCharge(charge);

      expect(paymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { reservationId: '11' } }),
        expect.anything(),
      );
    });

    it('forwards the idempotency key to Stripe', async () => {
      await service.createCharge({ ...charge, idempotencyKey: 'key-1' });

      expect(paymentIntentsCreate).toHaveBeenCalledWith(expect.anything(), {
        idempotencyKey: 'key-1',
      });
    });

    it('reports a declined card as a 402', async () => {
      paymentIntentsCreate.mockRejectedValue(
        new Stripe.errors.StripeCardError('Your card was declined.'),
      );

      const error = await service.createCharge(charge).catch((e) => e);

      expect(error).toBeInstanceOf(RpcException);
      expect(error.getError()).toEqual({
        status: 402,
        message: 'Your card was declined.',
      });
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

  describe('handleWebhook', () => {
    const body = Buffer.from('{}');
    const event = (type: string, metadata: Record<string, string> = {}) => ({
      type,
      data: { object: { id: 'pi_123', metadata } },
    });

    it('verifies the signature against the raw body and the webhook secret', async () => {
      constructEvent.mockReturnValue(event('charge.succeeded'));

      await service.handleWebhook(body, 't=1,v1=abc');

      expect(constructEvent).toHaveBeenCalledWith(
        body,
        't=1,v1=abc',
        'STRIPE_WEBHOOK_SECRET-value',
      );
    });

    it('rejects a delivery whose signature does not verify', async () => {
      constructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      await expect(
        service.handleWebhook(body, 'forged'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(reservations.send).not.toHaveBeenCalled();
    });

    it.each([
      ['payment_intent.succeeded', PAYMENT_SUCCEEDED],
      ['payment_intent.payment_failed', PAYMENT_FAILED],
    ])('relays %s to reservations', async (type, pattern) => {
      constructEvent.mockReturnValue(event(type, { reservationId: '11' }));

      await expect(service.handleWebhook(body, 'sig')).resolves.toEqual({
        received: true,
      });
      expect(reservations.send).toHaveBeenCalledWith(pattern, {
        reservationId: 11,
        paymentIntentId: 'pi_123',
      });
    });

    it('acknowledges events it does not act on', async () => {
      constructEvent.mockReturnValue(event('customer.created'));

      await expect(service.handleWebhook(body, 'sig')).resolves.toEqual({
        received: true,
      });
      expect(reservations.send).not.toHaveBeenCalled();
    });

    it('acknowledges a payment that names no reservation', async () => {
      constructEvent.mockReturnValue(event('payment_intent.succeeded'));

      await service.handleWebhook(body, 'sig');

      expect(reservations.send).not.toHaveBeenCalled();
    });

    it('asks Stripe to redeliver when reservations cannot record it', async () => {
      constructEvent.mockReturnValue(
        event('payment_intent.succeeded', { reservationId: '11' }),
      );
      reservations.send.mockReturnValue(
        throwError(() => ({ status: 500, message: 'Internal server error' })),
      );

      await expect(service.handleWebhook(body, 'sig')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('does not ask for redelivery when reservations refuses the event', async () => {
      constructEvent.mockReturnValue(
        event('payment_intent.succeeded', { reservationId: '999' }),
      );
      reservations.send.mockReturnValue(
        throwError(() => ({ status: 404, message: 'Reservation not found' })),
      );

      await expect(service.handleWebhook(body, 'sig')).resolves.toEqual({
        received: true,
      });
    });
  });
});
