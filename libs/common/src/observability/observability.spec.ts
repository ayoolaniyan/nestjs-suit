import { CallHandler, ExecutionContext } from '@nestjs/common';
import { EventEmitter } from 'events';
import { PinoLogger } from 'nestjs-pino';
import { firstValueFrom, of } from 'rxjs';
import {
  acceptOrCreateRequestId,
  currentRequestId,
  runWithRequestId,
  withRequestId,
} from './request-context';
import { RpcRequestContextInterceptor } from './rpc-request-context.interceptor';
import { httpMetricsMiddleware, metricsRegistry } from './metrics';

describe('request context', () => {
  it('keeps a well-formed incoming id', () => {
    expect(acceptOrCreateRequestId('abc-123')).toBe('abc-123');
  });

  it('replaces an id that could forge log lines', () => {
    const id = acceptOrCreateRequestId('abc\n{"level":60}');
    expect(id).not.toContain('\n');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('adds the current id to outgoing payloads', () => {
    runWithRequestId('req-1', () => {
      expect(withRequestId({ a: 1 })).toEqual({ a: 1, requestId: 'req-1' });
    });
  });

  it('leaves payloads alone outside a request', () => {
    expect(withRequestId({ a: 1 })).toEqual({ a: 1 });
  });
});

describe('RpcRequestContextInterceptor', () => {
  const lines: { bindings: object; fields: object; msg: string }[] = [];
  const fakeLogger = (bindings: object) => ({
    info: (fields: object, msg: string) =>
      lines.push({ bindings, fields, msg }),
    warn: (fields: object, msg: string) =>
      lines.push({ bindings, fields, msg }),
  });
  const interceptor = new RpcRequestContextInterceptor({
    logger: { child: fakeLogger },
  } as unknown as PinoLogger);

  beforeEach(() => (lines.length = 0));

  const rpcContext = (data: unknown) =>
    ({
      getType: () => 'rpc',
      switchToRpc: () => ({
        getData: () => data,
        getContext: () => ({ getPattern: () => 'test_pattern' }),
      }),
    }) as unknown as ExecutionContext;

  it("restores the caller's id for the handler", async () => {
    const handler: CallHandler = { handle: () => of(currentRequestId()) };

    // handle() is called inside the restored context.
    const seen = await firstValueFrom(
      interceptor.intercept(rpcContext({ requestId: 'req-9' }), {
        handle: () => handler.handle(),
      }),
    );

    expect(seen).toBe('req-9');
  });

  it('logs each handled message with its pattern and request id', async () => {
    await firstValueFrom(
      interceptor.intercept(rpcContext({ requestId: 'req-9' }), {
        handle: () => of('ok'),
      }),
    );

    expect(lines).toEqual([
      expect.objectContaining({
        bindings: { requestId: 'req-9', pattern: 'test_pattern' },
        msg: 'message handled',
      }),
    ]);
  });

  it('leaves HTTP requests to the middleware', async () => {
    const handle = jest.fn(() => of('ok'));
    const context = { getType: () => 'http' } as unknown as ExecutionContext;

    await firstValueFrom(interceptor.intercept(context, { handle }));

    expect(handle).toHaveBeenCalled();
  });
});

describe('httpMetricsMiddleware', () => {
  it('labels by route template, not by the raw URL', async () => {
    const res = Object.assign(new EventEmitter(), { statusCode: 200 });
    const req = {
      method: 'GET',
      baseUrl: '',
      route: { path: '/reservations/:id' },
    };

    httpMetricsMiddleware(req as never, res as never, () => undefined);
    res.emit('finish');

    const metrics = await metricsRegistry.getSingleMetricAsString(
      'http_request_duration_seconds',
    );
    expect(metrics).toContain('route="/reservations/:id"');
    expect(metrics).not.toMatch(/route="\/reservations\/\d+"/);
  });
});
