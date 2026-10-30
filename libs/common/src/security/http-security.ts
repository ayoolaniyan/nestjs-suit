import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as Joi from 'joi';
import { REQUEST_ID_HEADER } from '../observability/request-context';

/** Merge into the config validation schema of each public HTTP service. */
export const httpSecurityValidationSchema = {
  // Comma-separated browser origins allowed to call the API with cookies,
  // e.g. https://app.example.com. Unset or empty, cross-origin requests are
  // refused.
  CORS_ORIGINS: Joi.string().allow(''),
  // Proxies in front of the service (the ALB is one). req.ip, and so rate
  // limiting, uses the client address they forward instead of theirs.
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).default(0),
  // Requests per minute, per client address and route.
  RATE_LIMIT_PER_MINUTE: Joi.number().integer().min(1).default(120),
};

/**
 * Security headers, CORS and proxy trust for a public HTTP service. Called
 * from main.ts before any route is registered.
 */
export function applyHttpSecurity(app: NestExpressApplication) {
  const configService = app.get(ConfigService);

  app.use(helmet());

  const hops = configService.get<number>('TRUST_PROXY_HOPS');
  if (hops) {
    app.set('trust proxy', hops);
  }

  const origins = configService
    .get<string>('CORS_ORIGINS')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins?.length) {
    app.enableCors({
      origin: origins,
      // Authentication is a cookie, which a browser sends cross-origin only
      // with credentials allowed. Hence an explicit list, never `*`.
      credentials: true,
      exposedHeaders: [REQUEST_ID_HEADER],
    });
  }
}
