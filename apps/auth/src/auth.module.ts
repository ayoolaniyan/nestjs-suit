import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ExecutionContext, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from './users/users.module';
import {
  AllExceptionsFilter,
  DatabaseModule,
  databaseValidationSchema,
  HealthModule,
  httpSecurityValidationSchema,
  HttpThrottlerGuard,
  LoggerModule,
  MetricsModule,
  rateLimitingModule,
  RpcRequestContextInterceptor,
} from '@app/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { Session } from './sessions/session.entity';
import { SessionsRepository } from './sessions/sessions.repository';
import { SessionsService } from './sessions/sessions.service';

const FIFTEEN_MINUTES_MS = 15 * 60_000;

/**
 * Login attempts are counted per client address and email, so guessing one
 * account's password is slowed without locking its owner out from
 * elsewhere. Every attempt counts, successful or not.
 */
const loginThrottler = (configService: ConfigService) => ({
  name: 'login',
  ttl: FIFTEEN_MINUTES_MS,
  limit: () => configService.getOrThrow<number>('LOGIN_ATTEMPTS_PER_15_MIN'),
  getTracker: (request: Record<string, any>) =>
    `${request.ip}:${String(request.body?.email ?? '').toLowerCase()}`,
  skipIf: (context: ExecutionContext) =>
    context.getHandler() !== AuthController.prototype.login,
});

@Module({
  imports: [
    UsersModule,
    LoggerModule,
    HealthModule.forRoot({ database: true }),
    MetricsModule,
    DatabaseModule.forFeature([Session]),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        ...databaseValidationSchema,
        ...httpSecurityValidationSchema,
        JWT_SECRET: Joi.string().required(),
        // Access token lifetime, in seconds. Keep it short: the refresh
        // token renews it, and a session can be revoked at any time.
        JWT_EXPIRATION: Joi.number().required(),
        // Session (refresh token) lifetime, in seconds.
        REFRESH_TOKEN_EXPIRATION: Joi.number()
          .integer()
          .min(60)
          .default(30 * 24 * 60 * 60),
        // Cookies are HTTPS-only by default in production.
        COOKIE_SECURE: Joi.boolean(),
        LOGIN_ATTEMPTS_PER_15_MIN: Joi.number().integer().min(1).default(10),
        HTTP_PORT: Joi.number().required(),
        TCP_PORT: Joi.number().required(),
        SWAGGER_ENABLED: Joi.boolean(),
      }),
    }),
    rateLimitingModule([loginThrottler]),
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
    SessionsService,
    SessionsRepository,
    // Module-level, so they also apply to the TCP handlers.
    { provide: APP_INTERCEPTOR, useClass: RpcRequestContextInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
  ],
})
export class AuthModule {}
