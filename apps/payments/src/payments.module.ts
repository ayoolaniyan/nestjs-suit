import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WebhooksController } from './webhooks.controller';
import {
  AllExceptionsFilter,
  HealthModule,
  LoggerModule,
  MetricsModule,
  RESERVATIONS_SERVICE,
  RpcRequestContextInterceptor,
} from '@app/common';
import * as Joi from 'joi';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    LoggerModule,
    // Stripe is not checked: an outage there is reported per charge, and
    // taking payments out of service would not help.
    HealthModule.forRoot(),
    MetricsModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        HTTP_PORT: Joi.number().required(),
        TCP_PORT: Joi.number().required(),
        STRIPE_SECRET_KEY: Joi.string().required(),
        // The endpoint's signing secret (whsec_...), from the Stripe
        // dashboard or `stripe listen`.
        STRIPE_WEBHOOK_SECRET: Joi.string().required(),
        RESERVATIONS_HOST: Joi.string().required(),
        RESERVATIONS_PORT: Joi.number().required(),
      }),
    }),
    ClientsModule.registerAsync([
      {
        name: RESERVATIONS_SERVICE,
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('RESERVATIONS_HOST'),
            port: configService.get<number>('RESERVATIONS_PORT'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [PaymentsController, WebhooksController],
  providers: [
    PaymentsService,
    // Module-level, so they also apply to the TCP handlers.
    { provide: APP_INTERCEPTOR, useClass: RpcRequestContextInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class PaymentsModule {}
