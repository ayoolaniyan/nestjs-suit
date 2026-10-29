import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

// For the HTTP services, which are also the ones with a database. The
// TCP-only services are probed on their socket instead.
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
