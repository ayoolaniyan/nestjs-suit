import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Response } from 'express';
import { STATUS_CODES } from 'http';
import { throwError } from 'rxjs';
import { currentRequestId } from '../observability/request-context';

/** Every HTTP error response, from every service, has this shape. */
export interface ErrorResponseBody {
  statusCode: number;
  /** The status text, e.g. "Not Found". */
  error: string;
  message: string | string[];
  /** Quote it when reporting a problem; it finds the request in the logs. */
  requestId?: string;
  /** Structured detail some errors carry, e.g. which health check failed. */
  details?: unknown;
}

/** Every RPC error reply has this shape, so callers can rely on `status`. */
export interface RpcErrorPayload {
  status: number;
  message: string | string[];
}

interface DescribedError extends RpcErrorPayload {
  details?: unknown;
  /** Raised on purpose, as opposed to a bug or an unhandled failure. */
  expected: boolean;
}

const INTERNAL: DescribedError = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  message: 'Internal server error',
  expected: false,
};

/**
 * Turns anything thrown in a handler into one error shape: a JSON body over
 * HTTP, a `{ status, message }` reply over RPC.
 *
 * Without it, HTTP errors had Nest's default shape, while a TCP handler that
 * threw an HttpException (say, the JWT strategy's 401) replied with a bare
 * "Internal server error", so callers could not tell a refused token from an
 * outage. Unexpected errors are logged with their stack and reported as a
 * generic 500, so internals never reach a client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const { status, message, details, expected } = this.describe(exception);

    // Deliberate errors were logged, with their cause, where they were
    // raised; only a bug's stack is news here.
    if (!expected) {
      this.logger.error(
        (exception as Error)?.message ?? String(exception),
        (exception as Error)?.stack,
      );
    }

    if (host.getType() === 'rpc') {
      return throwError((): RpcErrorPayload => ({ status, message }));
    }

    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) {
      return;
    }
    const body: ErrorResponseBody = {
      statusCode: status,
      error: STATUS_CODES[status] ?? 'Error',
      message,
      requestId: currentRequestId(),
      details,
    };
    response.status(status).json(body);
  }

  private describe(exception: unknown): DescribedError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return { status, message: response, expected: true };
      }
      const { message } = response as { message?: string | string[] };
      // A body of some other shape (Terminus's health report, for one) is
      // kept as details rather than dropped.
      return message === undefined
        ? {
            status,
            message: exception.message,
            details: response,
            expected: true,
          }
        : { status, message, expected: true };
    }

    if (exception instanceof RpcException) {
      return this.fromRpcPayload(exception.getError()) ?? INTERNAL;
    }

    // An error reply from another service, rethrown as it arrived.
    return this.fromRpcPayload(exception) ?? INTERNAL;
  }

  private fromRpcPayload(payload: unknown): DescribedError | undefined {
    const { status, message } = (payload ?? {}) as Partial<RpcErrorPayload>;
    if (
      typeof status === 'number' &&
      status >= 400 &&
      status <= 599 &&
      message !== undefined
    ) {
      // Raised deliberately, so the message was written for the caller.
      return { status, message, expected: true };
    }
    return undefined;
  }
}
