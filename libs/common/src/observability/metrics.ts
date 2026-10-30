import {
  Histogram,
  Registry,
  collectDefaultMetrics,
} from '@prometheus-io/client';
import { NextFunction, Request, Response } from 'express';
import { Observable, TimeoutError, tap } from 'rxjs';

export const metricsRegistry = new Registry();

let defaultMetricsStarted = false;

/** Process metrics (CPU, memory, event loop lag, GC). Idempotent. */
export function startDefaultMetrics() {
  if (!defaultMetricsStarted) {
    collectDefaultMetrics({ register: metricsRegistry });
    defaultMetricsStarted = true;
  }
}

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency, by route template and status code.',
  labelNames: ['method', 'route', 'status'],
  registers: [metricsRegistry],
});

const rpcClientDuration = new Histogram({
  name: 'rpc_client_duration_seconds',
  help: 'Latency of TCP calls to other services, by message pattern and outcome.',
  labelNames: ['pattern', 'outcome'],
  // Payment calls wait on Stripe, so the buckets reach past the 15s timeout.
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20],
  registers: [metricsRegistry],
});

/**
 * Labels by the matched route template (`/reservations/:id`), never the raw
 * URL: one label value per id would make the series count unbounded.
 */
export function httpMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    end({
      method: req.method,
      route: req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched',
      status: String(res.statusCode),
    });
  });
  next();
}

/** Times a ClientProxy call; pipe it in after timeout(). */
export function observeRpc<T>(pattern: string) {
  return (source: Observable<T>) => {
    const end = rpcClientDuration.startTimer({ pattern });
    return source.pipe(
      tap({
        complete: () => end({ outcome: 'success' }),
        error: (error) =>
          end({ outcome: error instanceof TimeoutError ? 'timeout' : 'error' }),
      }),
    );
  };
}
