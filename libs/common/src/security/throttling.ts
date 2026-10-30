import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ThrottlerGuard,
  ThrottlerModule,
  ThrottlerOptions,
} from '@nestjs/throttler';

/**
 * Rate limits HTTP requests only. Registered as APP_GUARD, it would otherwise
 * also run for TCP messages, where there is no client address and every
 * internal call would share one counter.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return context.getType() !== 'http' || super.shouldSkip(context);
  }
}

/**
 * The `default` throttler, RATE_LIMIT_PER_MINUTE requests per client address
 * per route, plus any the service adds. Counters are in memory, so each
 * replica limits on its own.
 */
export function rateLimitingModule(
  extraThrottlers: Array<
    (configService: ConfigService) => ThrottlerOptions
  > = [],
) {
  return ThrottlerModule.forRootAsync({
    inject: [ConfigService],
    useFactory: (configService: ConfigService) => ({
      throttlers: [
        {
          name: 'default',
          ttl: 60_000,
          limit: configService.getOrThrow<number>('RATE_LIMIT_PER_MINUTE'),
        },
        ...extraThrottlers.map((throttler) => throttler(configService)),
      ],
    }),
  });
}
