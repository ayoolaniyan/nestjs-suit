import { NestFactory } from '@nestjs/core';
import { PaymentsModule } from './payments.module';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { httpMetricsMiddleware, requestIdMiddleware } from '@app/common';

async function bootstrap() {
  // rawBody: Stripe signs the exact bytes of a webhook, so they are kept
  // alongside the parsed body.
  const app = await NestFactory.create(PaymentsModule, { rawBody: true });
  app.use(requestIdMiddleware);
  app.use(httpMetricsMiddleware);
  const configService = app.get(ConfigService);
  // inheritAppConfig, or the app-level interceptors (request context and
  // per-message logging) never reach the TCP handlers.
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.TCP,
      options: {
        host: '0.0.0.0',
        port: configService.getOrThrow<number>('TCP_PORT'),
      },
    },
    { inheritAppConfig: true },
  );
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.startAllMicroservices();
  // HTTP serves Stripe webhooks, health checks and metrics.
  await app.listen(configService.getOrThrow<number>('HTTP_PORT'));
}
bootstrap();
