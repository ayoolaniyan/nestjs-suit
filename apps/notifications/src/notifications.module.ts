import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import * as Joi from 'joi';
import {
  AllExceptionsFilter,
  HealthModule,
  LoggerModule,
  rabbitmqValidationSchema,
  RpcRequestContextInterceptor,
} from '@app/common';
import { ConfigModule } from '@nestjs/config';
import { mailValidationSchema } from './mail-transport';

@Module({
  imports: [
    LoggerModule,
    HealthModule.forRoot({ rabbitmq: true }),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        ...rabbitmqValidationSchema,
        ...mailValidationSchema,
        // Attempts per email, the first included, before it is parked.
        MAIL_MAX_ATTEMPTS: Joi.number().integer().min(1).default(5),
        // Health checks only.
        HTTP_PORT: Joi.number().required(),
      }),
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    // Module-level, so they also apply to the message handlers.
    { provide: APP_INTERCEPTOR, useClass: RpcRequestContextInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class NotificationsModule {}
