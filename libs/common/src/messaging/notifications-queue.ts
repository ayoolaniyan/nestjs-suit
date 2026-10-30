import { ConfigService } from '@nestjs/config';
import { connect } from 'amqplib';
import { RmqOptions, Transport } from '@nestjs/microservices';
import * as Joi from 'joi';

/** Merge into the config validation schema of each service using RabbitMQ. */
export const rabbitmqValidationSchema = {
  RABBITMQ_URL: Joi.string()
    .uri({ scheme: ['amqp', 'amqps'] })
    .required(),
};

/**
 * Email notifications travel through RabbitMQ rather than TCP, so a message
 * survives notifications being down or restarting: it waits in a durable
 * queue until it is delivered and acknowledged.
 *
 * Three queues, all on the default exchange:
 *  - `notifications`: where messages are published and consumed.
 *  - `notifications.retry`: a failed delivery waits here for the retry delay,
 *    then dead-letters back to `notifications`.
 *  - `notifications.dead`: messages that ran out of attempts, or could never
 *    be handled, parked for someone to inspect or replay.
 */
export const NOTIFICATIONS_QUEUE = 'notifications';
export const NOTIFICATIONS_RETRY_QUEUE = 'notifications.retry';
export const NOTIFICATIONS_DEAD_LETTER_QUEUE = 'notifications.dead';

/**
 * How long a failed delivery waits before the next attempt. A queue-wide TTL
 * rather than a per-message one: RabbitMQ expires messages only at the head
 * of a queue, so differing delays would hold short ones behind long ones.
 * Changing it means deleting the retry queue, which RabbitMQ will not
 * redeclare with different arguments.
 */
export const NOTIFICATIONS_RETRY_DELAY_MS = 60_000;

/**
 * Producer and consumer both assert the main queue, and RabbitMQ refuses an
 * assertion whose arguments differ from the existing queue's, so both use
 * these.
 */
export const notificationsQueueOptions = {
  durable: true,
  arguments: {
    // A message rejected without requeueing (one with no handler, say) is
    // parked instead of dropped.
    'x-dead-letter-exchange': '',
    'x-dead-letter-routing-key': NOTIFICATIONS_DEAD_LETTER_QUEUE,
  },
};

export function notificationsRmqOptions(
  configService: ConfigService,
): RmqOptions {
  return {
    transport: Transport.RMQ,
    options: {
      urls: [configService.getOrThrow<string>('RABBITMQ_URL')],
      queue: NOTIFICATIONS_QUEUE,
      queueOptions: notificationsQueueOptions,
      // Written to disk, so a broker restart does not lose queued email.
      persistent: true,
    },
  };
}

/**
 * Declares the retry and dead-letter queues alongside the main one. Nest's
 * RMQ transport declares only the queue it consumes, so notifications calls
 * this before it starts listening.
 */
export async function assertNotificationsTopology(url: string) {
  const connection = await connect(url);
  try {
    const channel = await connection.createChannel();
    await channel.assertQueue(NOTIFICATIONS_DEAD_LETTER_QUEUE, {
      durable: true,
    });
    await channel.assertQueue(NOTIFICATIONS_RETRY_QUEUE, {
      durable: true,
      arguments: {
        'x-message-ttl': NOTIFICATIONS_RETRY_DELAY_MS,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': NOTIFICATIONS_QUEUE,
      },
    });
    await channel.assertQueue(NOTIFICATIONS_QUEUE, notificationsQueueOptions);
  } finally {
    await connection.close();
  }
}
