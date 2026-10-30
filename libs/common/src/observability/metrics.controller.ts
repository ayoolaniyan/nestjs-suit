import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { metricsRegistry } from './metrics';

/**
 * Prometheus scrape endpoint. Served at the root path, which the ingress
 * does not route, so it is reachable inside the cluster only.
 */
// Scraped on a schedule; never rate limited.
@SkipThrottle()
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', metricsRegistry.contentType)
  scrape() {
    return metricsRegistry.metrics();
  }
}
