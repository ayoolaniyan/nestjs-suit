import { APP_INTERCEPTOR } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from './users/users.module';
import {
  databaseValidationSchema,
  HealthModule,
  LoggerModule,
  MetricsModule,
  RpcRequestContextInterceptor,
} from '@app/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    LoggerModule,
    HealthModule,
    MetricsModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        ...databaseValidationSchema,
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRATION: Joi.number().required(),
        HTTP_PORT: Joi.number().required(),
        TCP_PORT: Joi.number().required(),
        SWAGGER_ENABLED: Joi.boolean(),
      }),
    }),
    JwtModule.registerAsync({
      useFactory: async (configService: ConfigService) => ({
        // Was 'JW_SECRET'. The typo resolved to undefined, so every token was
        // signed with an empty secret while JwtStrategy verified against
        // JWT_SECRET — login appeared to succeed and every subsequent
        // request was rejected.
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: `${configService.get<number>('JWT_EXPIRATION')}s`,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    // Module-level, so it also applies to the TCP handlers.
    { provide: APP_INTERCEPTOR, useClass: RpcRequestContextInterceptor },
  ],
})
export class AuthModule {}
