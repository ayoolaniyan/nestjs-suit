import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import {
  REQUEST_ID_HEADER,
  acceptOrCreateRequestId,
} from '../observability/request-context';

@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        // requestIdMiddleware has already accepted or created the id; reuse it
        // so the logged id is the one returned to the client and forwarded
        // over TCP.
        genReqId: (req) =>
          acceptOrCreateRequestId(req.headers[REQUEST_ID_HEADER]),
        // Same field name the RPC interceptor uses, so one query finds a
        // request's log lines in every service.
        customProps: (req) => ({ requestId: req.id }),
        // pino-http logs every request and response header by default, which
        // put the JWT (cookie or header) and the Set-Cookie issued at login
        // into the log stream.
        redact: {
          paths: [
            'req.headers.cookie',
            'req.headers.authorization',
            'req.headers.authentication',
            'res.headers["set-cookie"]',
          ],
          censor: '[REDACTED]',
        },
        // Plain JSON in production, where logs are shipped to an aggregator
        // and pretty-printing only costs CPU; readable lines everywhere else.
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                },
              },
      },
    }),
  ],
})
export class LoggerModule {}
