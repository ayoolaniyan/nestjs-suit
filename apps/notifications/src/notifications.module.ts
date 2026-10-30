import { APP_INTERCEPTOR } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import * as Joi from 'joi';
import { LoggerModule, RpcRequestContextInterceptor } from '@app/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    LoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        SMTP_USER: Joi.string().required(),
        GOOGLE_OAUTH_CLIENT_ID: Joi.string().required(),
        GOOGLE_OAUTH_CLIENT_SECRET: Joi.string().required(),
        GOOGLE_OAUTH_REFRESH_TOKEN: Joi.string().required(),
        PORT: Joi.number().required(),
      }),
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    // Module-level, so it also applies to the TCP handlers.
    { provide: APP_INTERCEPTOR, useClass: RpcRequestContextInterceptor },
  ],
})
export class NotificationsModule {}
