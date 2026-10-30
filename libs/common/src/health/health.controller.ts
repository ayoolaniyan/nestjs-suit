import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RmqOptions, Transport } from '@nestjs/microservices';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorFunction,
  MicroserviceHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';

export const HEALTH_CHECKS = Symbol('HEALTH_CHECKS');

/** The dependencies a service cannot do its job without. */
export interface HealthChecks {
  database?: boolean;
  rabbitmq?: boolean;
}

// Probes and load balancers poll these constantly; they must never be
// rate limited.
@SkipThrottle()
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly microservice: MicroserviceHealthIndicator,
    private readonly configService: ConfigService,
    @Inject(HEALTH_CHECKS) private readonly checks: HealthChecks,
  ) {}

  /**
   * Liveness: the process is up and serving HTTP. Deliberately checks no
   * dependencies, so a database outage does not get every pod restarted.
   */
  @Get()
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  /**
   * Readiness: the service can do its job. Answers 503 while a dependency is
   * unreachable, so traffic is routed away until it recovers.
   */
  @Get('ready')
  @HealthCheck()
  ready() {
    const indicators: HealthIndicatorFunction[] = [];
    if (this.checks.database) {
      indicators.push(() => this.db.pingCheck('database'));
    }
    if (this.checks.rabbitmq) {
      indicators.push(() =>
        this.microservice.pingCheck<RmqOptions>('rabbitmq', {
          transport: Transport.RMQ,
          timeout: 3000,
          options: {
            urls: [this.configService.getOrThrow<string>('RABBITMQ_URL')],
            // Connect only; asserting would create a stray queue.
            noAssert: true,
          },
        }),
      );
    }
    return this.health.check(indicators);
  }
}
