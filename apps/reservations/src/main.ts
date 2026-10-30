import {
  applyHttpSecurity,
  httpMetricsMiddleware,
  requestIdMiddleware,
  setupSwagger,
} from '@app/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ReservationsModule } from './reservations.module';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app =
    await NestFactory.create<NestExpressApplication>(ReservationsModule);
  // First, so every later middleware, guard and log line sees the id.
  app.use(requestIdMiddleware);
  app.use(httpMetricsMiddleware);
  applyHttpSecurity(app);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useLogger(app.get(Logger));
  // Closes HTTP, TCP and database connections on SIGTERM, so a rolling
  // deploy drains in-flight requests instead of cutting them off.
  app.enableShutdownHooks();
  app.use(cookieParser());
  const configService = app.get(ConfigService);
  // Payment outcomes from payments. inheritAppConfig, so the request context
  // interceptor and the exception filter reach these handlers too.
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
  setupSwagger(app, { title: 'Reservations', path: 'reservations/docs' });
  await app.startAllMicroservices();
  await app.listen(configService.getOrThrow<number>('HTTP_PORT'));
}
bootstrap();
