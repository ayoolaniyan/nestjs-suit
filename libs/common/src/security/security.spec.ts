import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { applyHttpSecurity } from './http-security';
import { HttpThrottlerGuard } from './throttling';

describe('applyHttpSecurity', () => {
  function apply(config: Record<string, unknown>) {
    const app = {
      get: () => ({ get: (key: string) => config[key] }) as ConfigService,
      use: jest.fn(),
      set: jest.fn(),
      enableCors: jest.fn(),
    };
    applyHttpSecurity(app as unknown as NestExpressApplication);
    return app;
  }

  it('sets security headers', () => {
    expect(apply({}).use).toHaveBeenCalledWith(expect.any(Function));
  });

  it('refuses cross-origin requests unless origins are listed', () => {
    expect(apply({}).enableCors).not.toHaveBeenCalled();
    expect(apply({ CORS_ORIGINS: '' }).enableCors).not.toHaveBeenCalled();
  });

  it('allows the listed origins, with credentials for the cookie', () => {
    const app = apply({
      CORS_ORIGINS: 'https://app.example.com, https://admin.example.com',
    });

    expect(app.enableCors).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: ['https://app.example.com', 'https://admin.example.com'],
        credentials: true,
      }),
    );
  });

  it('trusts the configured number of proxies, and none by default', () => {
    expect(apply({}).set).not.toHaveBeenCalled();
    expect(apply({ TRUST_PROXY_HOPS: 1 }).set).toHaveBeenCalledWith(
      'trust proxy',
      1,
    );
  });
});

describe('HttpThrottlerGuard', () => {
  const guard = Object.create(HttpThrottlerGuard.prototype) as {
    shouldSkip(context: ExecutionContext): Promise<boolean>;
  };
  const context = (type: string) =>
    ({ getType: () => type }) as unknown as ExecutionContext;

  it('never limits TCP messages, which have no client address', async () => {
    await expect(guard.shouldSkip(context('rpc'))).resolves.toBe(true);
  });

  it('limits HTTP requests', async () => {
    jest
      .spyOn(ThrottlerGuard.prototype as any, 'shouldSkip')
      .mockResolvedValue(false);

    await expect(guard.shouldSkip(context('http'))).resolves.toBe(false);
  });
});
