import { Controller, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import {
  NOTIFICATIONS_RETRY_QUEUE,
  NOTIFY_EMAIL,
  NotifyEmailEvent,
} from '@app/common';
import { NotificationsService } from './notifications.service';
import { NotifyEmailDto } from './dto/notify-email.dto';

/** Header counting delivery attempts, starting from 1. */
export const ATTEMPT_HEADER = 'x-attempt';

/**
 * Consumes the notifications queue with manual acknowledgement: a message
 * leaves the queue only once its email has been handed to the mail server.
 *
 *  - Sent: acknowledged.
 *  - Failed: copied to the retry queue with its attempt count raised, and
 *    acknowledged; it returns after the retry delay. Copying, rather than
 *    rejecting, is what lets the count travel with the message.
 *  - Failed for the last time, or invalid (retrying cannot fix it): rejected,
 *    which dead-letters it to the parking queue.
 */
@Controller()
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  @EventPattern(NOTIFY_EMAIL)
  async notifyEmail(@Payload() payload: unknown, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef() as ConfirmChannel;
    const message = context.getMessage() as ConsumeMessage;

    const event = await this.parse(payload);
    if (!event) {
      channel.nack(message, false, false);
      return;
    }

    const attempt = Number(message.properties.headers?.[ATTEMPT_HEADER] ?? 1);
    try {
      await this.notificationsService.notifyEmail(event);
      channel.ack(message);
    } catch (error) {
      await this.retryLater(channel, message, attempt, error as Error);
    }
  }

  private async parse(payload: unknown): Promise<NotifyEmailEvent | null> {
    const event = plainToInstance(NotifyEmailDto, payload);
    const errors =
      event && typeof event === 'object'
        ? await validate(event, { whitelist: true })
        : ['not an object'];
    if (errors.length > 0) {
      this.logger.warn(
        `Invalid ${NOTIFY_EMAIL} message parked: ${errors.toString()}`,
      );
      return null;
    }
    return event;
  }

  private async retryLater(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    attempt: number,
    error: Error,
  ) {
    const maxAttempts =
      this.configService.getOrThrow<number>('MAIL_MAX_ATTEMPTS');
    if (attempt >= maxAttempts) {
      this.logger.error(
        `Email failed on attempt ${attempt} of ${maxAttempts}; parked: ${error.message}`,
      );
      channel.nack(message, false, false);
      return;
    }

    this.logger.warn(
      `Email failed on attempt ${attempt} of ${maxAttempts}; will retry: ${error.message}`,
    );
    // Acknowledged only after the broker confirms it has the copy, so a crash
    // in between delivers twice rather than never.
    await new Promise<void>((resolve, reject) =>
      channel.sendToQueue(
        NOTIFICATIONS_RETRY_QUEUE,
        message.content,
        {
          persistent: true,
          contentType: message.properties.contentType,
          headers: {
            ...message.properties.headers,
            [ATTEMPT_HEADER]: attempt + 1,
          },
        },
        (err) => (err ? reject(err) : resolve()),
      ),
    );
    channel.ack(message);
  }
}
