import { DynamicModule, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import {
  HEALTH_CHECKS,
  HealthChecks,
  HealthController,
} from './health.controller';

/**
 * `/health` (liveness) and `/health/ready` (readiness), the latter checking
 * the dependencies named here.
 */
@Module({})
export class HealthModule {
  static forRoot(checks: HealthChecks = {}): DynamicModule {
    return {
      module: HealthModule,
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [{ provide: HEALTH_CHECKS, useValue: checks }],
    };
  }
}
