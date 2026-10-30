import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import {
  DatabaseModule,
  databaseValidationSchema,
  LoggerModule,
  AUTH_SERVICE,
  PAYMENTS_SERVICE,
  HealthModule,
  MetricsModule,
  AllExceptionsFilter,
  httpSecurityValidationSchema,
  HttpThrottlerGuard,
  NOTIFICATION_SERVICE,
  notificationsRmqOptions,
  rabbitmqValidationSchema,
  rateLimitingModule,
  RpcRequestContextInterceptor,
} from '@app/common';
import { ReservationsRepository } from './reservations.repository';
import { Reservation } from './models/reservation.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { reservationsDatabaseOptions } from './database/database.options';
import { Place } from './places/place.entity';
import { PlacesController } from './places/places.controller';
import { PlacesService } from './places/places.service';
import { PlacesRepository } from './places/places.repository';
import { PaymentEventsController } from './payment-events.controller';

@Module({
  imports: [
    DatabaseModule.forRoot(reservationsDatabaseOptions),
    HealthModule.forRoot({ database: true }),
    DatabaseModule.forFeature([Reservation, Place]),
    MetricsModule,
    LoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        ...databaseValidationSchema,
        ...httpSecurityValidationSchema,
        ...rabbitmqValidationSchema,
        HTTP_PORT: Joi.number().required(),
        // Receives payment outcomes from payments.
        TCP_PORT: Joi.number().required(),
        AUTH_HOST: Joi.string().required(),
        AUTH_PORT: Joi.number().required(),
        PAYMENTS_HOST: Joi.string().required(),
        PAYMENTS_PORT: Joi.number().required(),
        SWAGGER_ENABLED: Joi.boolean(),
      }),
    }),
    rateLimitingModule(),
    ClientsModule.registerAsync([
      {
        name: AUTH_SERVICE,
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('AUTH_HOST'),
            port: configService.get<number>('AUTH_PORT'),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: PAYMENTS_SERVICE,
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('PAYMENTS_HOST'),
            port: configService.get<number>('PAYMENTS_PORT'),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: NOTIFICATION_SERVICE,
        useFactory: notificationsRmqOptions,
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [
    ReservationsController,
    PlacesController,
    PaymentEventsController,
  ],
  providers: [
    ReservationsService,
    ReservationsRepository,
    PlacesService,
    PlacesRepository,
    // Module-level, so they also apply to the TCP handlers.
    { provide: APP_INTERCEPTOR, useClass: RpcRequestContextInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
  ],
})
export class ReservationsModule {}
