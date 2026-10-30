import { NestFactory } from '@nestjs/core';
import { NotificationsModule } from './notifications.module';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import {
  assertNotificationsTopology,
  notificationsRmqOptions,
} from '@app/common';

async function bootstrap() {
  const app = await NestFactory.create(NotificationsModule);
  const configService = app.get(ConfigService);

  await assertNotificationsTopology(
    configService.getOrThrow<string>('RABBITMQ_URL'),
  );
  const rmq = notificationsRmqOptions(configService);
  // inheritAppConfig, or the app-level interceptors (request context and
  // per-message logging) never reach the message handlers.
  app.connectMicroservice<MicroserviceOptions>(
    {
      ...rmq,
      options: {
        ...rmq.options,
        // Acknowledged by the handler once the email is sent, so a crash
        // mid-send leaves the message queued rather than lost.
        noAck: false,
        // Emails in flight at once.
        prefetchCount: 10,
      },
    },
    { inheritAppConfig: true },
  );
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.startAllMicroservices();
  // HTTP serves health checks only.
  await app.listen(configService.getOrThrow<number>('HTTP_PORT'));
}
bootstrap();
