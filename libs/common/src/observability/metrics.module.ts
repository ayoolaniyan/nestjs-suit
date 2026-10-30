import { Module, OnModuleInit } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { startDefaultMetrics } from './metrics';

@Module({
  controllers: [MetricsController],
})
export class MetricsModule implements OnModuleInit {
  // Started here rather than on import, so unit tests that only import the
  // helpers do not start the collectors.
  onModuleInit() {
    startDefaultMetrics();
  }
}
