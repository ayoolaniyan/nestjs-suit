import { NestFactory } from '@nestjs/core';
import { NotificationsModule } from './notifications.module';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(NotificationsModule);
  // Created as an HTTP application only to read validated config for the
  // TCP options; it never listens on HTTP.
  const configService = app.get(ConfigService);
  // inheritAppConfig, or the app-level interceptors (request context and
  // per-message logging) never reach the TCP handlers.
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: configService.getOrThrow<number>('PORT'),
      },
    },
    { inheritAppConfig: true },
  );
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.startAllMicroservices();
}
bootstrap();
