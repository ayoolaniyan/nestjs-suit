import { ConfigService } from '@nestjs/config';
import { RmqContext } from '@nestjs/microservices';
import {
  EmailTemplate,
  NOTIFICATIONS_RETRY_QUEUE,
  NotifyEmailEvent,
} from '@app/common';
import {
  ATTEMPT_HEADER,
  NotificationsController,
} from './notifications.controller';

describe('NotificationsController', () => {
  let notifyEmail: jest.Mock;
  let channel: { ack: jest.Mock; nack: jest.Mock; sendToQueue: jest.Mock };
  let controller: NotificationsController;

  const event: NotifyEmailEvent = {
    email: 'user@example.com',
    template: EmailTemplate.BookingConfirmed,
    data: {
      reservationId: 11,
      startDate: '2026-11-01',
      endDate: '2026-11-04',
      amountCents: 37500,
    },
  };

  /** A delivered message, on its `attempt`th delivery. */
  function delivery(attempt?: number) {
    const message = {
      content: Buffer.from('{}'),
      properties: {
        contentType: 'application/json',
        headers: attempt ? { [ATTEMPT_HEADER]: attempt } : {},
      },
    };
    const context = {
      getChannelRef: () => channel,
      getMessage: () => message,
    } as unknown as RmqContext;
    return { message, context };
  }

  beforeEach(() => {
    notifyEmail = jest.fn().mockResolvedValue(undefined);
    channel = {
      ack: jest.fn(),
      nack: jest.fn(),
      // Confirms immediately, as the broker would.
      sendToQueue: jest.fn((_queue, _content, _options, confirmed) =>
        confirmed(null),
      ),
    };
    controller = new NotificationsController(
      { notifyEmail } as any,
      { getOrThrow: () => 3 } as unknown as ConfigService,
    );
  });

  it('acknowledges a message once its email is sent', async () => {
    const { message, context } = delivery();

    await controller.notifyEmail(event, context);

    expect(notifyEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' }),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('schedules a retry with the attempt count raised when sending fails', async () => {
    notifyEmail.mockRejectedValue(new Error('421 try again later'));
    const { message, context } = delivery();

    await controller.notifyEmail(event, context);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      NOTIFICATIONS_RETRY_QUEUE,
      message.content,
      expect.objectContaining({
        persistent: true,
        headers: { [ATTEMPT_HEADER]: 2 },
      }),
      expect.any(Function),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('acknowledges only after the broker confirms the retry copy', async () => {
    notifyEmail.mockRejectedValue(new Error('timeout'));
    channel.sendToQueue.mockImplementation((_q, _c, _o, confirmed) =>
      confirmed(new Error('channel closed')),
    );
    const { context } = delivery();

    await expect(controller.notifyEmail(event, context)).rejects.toThrow(
      'channel closed',
    );
    // Left unacknowledged, so RabbitMQ redelivers it.
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('parks a message that has used up its attempts', async () => {
    notifyEmail.mockRejectedValue(new Error('550 mailbox unavailable'));
    const { message, context } = delivery(3);

    await controller.notifyEmail(event, context);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('parks an invalid message without trying to send it', async () => {
    const { message, context } = delivery();

    await controller.notifyEmail(
      { ...event, template: 'free_holiday' },
      context,
    );

    expect(notifyEmail).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
  });
});
