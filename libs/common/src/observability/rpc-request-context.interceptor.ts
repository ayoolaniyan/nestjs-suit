import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Store, storage as loggerStorage } from 'nestjs-pino/storage';
import { Observable, tap } from 'rxjs';
import { acceptOrCreateRequestId, runWithRequestId } from './request-context';

/**
 * The receiving half of withRequestId(): restores the caller's request id for
 * the duration of a message handler, both for further outgoing calls and as
 * a `requestId` field on every log line the handler writes.
 *
 * Also writes one line per handled message, the TCP counterpart of the line
 * pino-http writes per HTTP request; without it a service that logs nothing
 * itself leaves no trace of a request passing through.
 */
@Injectable()
export class RpcRequestContextInterceptor implements NestInterceptor {
  // Injected rather than read from PinoLogger.root, which nestjs-pino sets
  // only while configuring HTTP middleware: in the TCP-only services it is
  // never set at all.
  constructor(private readonly pinoLogger: PinoLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'rpc') {
      return next.handle();
    }

    const rpc = context.switchToRpc();
    const requestId = acceptOrCreateRequestId(rpc.getData()?.requestId);
    const pattern = (
      rpc.getContext() as { getPattern?: () => string }
    )?.getPattern?.();
    const logger = this.pinoLogger.logger.child({ requestId, pattern });

    return new Observable((subscriber) =>
      runWithRequestId(requestId, () =>
        loggerStorage.run(new Store(logger), () => {
          const started = Date.now();
          let failed = false;
          return next
            .handle()
            .pipe(
              tap({
                error: (error) => {
                  failed = true;
                  logger.warn(
                    {
                      durationMs: Date.now() - started,
                      error: error?.message,
                    },
                    'message failed',
                  );
                },
                // On completion or unsubscription: a consumer that stops
                // after the first value never sees `complete`.
                finalize: () => {
                  if (!failed) {
                    logger.info(
                      { durationMs: Date.now() - started },
                      'message handled',
                    );
                  }
                },
              }),
            )
            .subscribe(subscriber);
        }),
      ),
    );
  }
}
