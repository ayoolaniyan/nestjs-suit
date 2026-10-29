import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
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
   * Readiness: the service can do its job. Answers 503 while the database is
   * unreachable, so traffic is routed away until it recovers.
   */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
