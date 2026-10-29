import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NOTIFICATION_SERVICE } from '@app/common';
import { PaymentsService } from './payments.service';

const paymentIntentsCreate = jest.fn();

jest.mock('stripe', () => ({
  Stripe: jest.fn().mockImplementation(() => ({
    paymentIntents: { create: paymentIntentsCreate },
  })),
}));

describe('PaymentsService', () => {
  let service: PaymentsService;
  let notifications: { emit: jest.Mock };

  beforeEach(async () => {
    paymentIntentsCreate.mockReset();
    paymentIntentsCreate.mockResolvedValue({ id: 'pi_123' });
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
    await service.createCharge({
      amount: 5,
      email: 'user@example.com',
      paymentMethodId: 'pm_from_client',
    });

    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method: 'pm_from_client' }),
    );
  });

  it('notifies the customer once the charge succeeds', async () => {
    await service.createCharge({
      amount: 5,
      email: 'user@example.com',
      paymentMethodId: 'pm_from_client',
    });

    expect(notifications.emit).toHaveBeenCalledWith(
      'notify_email',
      expect.objectContaining({ email: 'user@example.com' }),
    );
  });
});
