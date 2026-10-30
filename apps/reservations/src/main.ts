import {
  httpMetricsMiddleware,
  requestIdMiddleware,
  setupSwagger,
} from '@app/common';
import { NestFactory } from '@nestjs/core';
import { ReservationsModule } from './reservations.module';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(ReservationsModule);
  // First, so every later middleware, guard and log line sees the id.
  app.use(requestIdMiddleware);
  app.use(httpMetricsMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useLogger(app.get(Logger));
  // Closes HTTP, TCP and database connections on SIGTERM, so a rolling
  // deploy drains in-flight requests instead of cutting them off.
  app.enableShutdownHooks();
  app.use(cookieParser());
  const configService = app.get(ConfigService);
  setupSwagger(app, { title: 'Reservations', path: 'reservations/docs' });
  await app.listen(configService.getOrThrow<number>('PORT'));
}
bootstrap();
