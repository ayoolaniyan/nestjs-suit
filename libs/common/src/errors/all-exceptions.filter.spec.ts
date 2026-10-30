import {
  ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { runWithRequestId } from '../observability/request-context';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  /** Runs the filter for an HTTP request and returns what it sent. */
  function overHttp(exception: unknown) {
    const response = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    runWithRequestId('req-1', () => filter.catch(exception, host));
    return {
      status: response.status.mock.calls[0]?.[0],
      body: response.json.mock.calls[0]?.[0],
    };
  }

  /** Runs the filter for a message handler and returns the error reply. */
  function overRpc(exception: unknown) {
    const host = { getType: () => 'rpc' } as unknown as ArgumentsHost;
    const reply = filter.catch(exception, host) as Observable<never>;
    return firstValueFrom(reply).catch((error) => error);
  }

  describe('over HTTP', () => {
    it('keeps the status and message of an HttpException, with the request id', () => {
      expect(overHttp(new NotFoundException('Place not found'))).toEqual({
        status: 404,
        body: {
          statusCode: 404,
          error: 'Not Found',
          message: 'Place not found',
          requestId: 'req-1',
        },
      });
    });

    it('keeps validation messages as a list', () => {
      const { body } = overHttp(
        new BadRequestException(['email must be an email']),
      );

      expect(body.message).toEqual(['email must be an email']);
    });

    it('hides the detail of an unexpected error behind a 500', () => {
      const { status, body } = overHttp(
        new Error('ER_ACCESS_DENIED for user app@10.0.0.5'),
      );

      expect(status).toBe(500);
      expect(body.message).toBe('Internal server error');
      expect(JSON.stringify(body)).not.toContain('ER_ACCESS_DENIED');
    });

    it('passes on the status of an error reply from another service', () => {
      expect(
        overHttp({ status: 402, message: 'Your card was declined.' }),
      ).toMatchObject({
        status: 402,
        body: { message: 'Your card was declined.' },
      });
    });

    it('keeps a structured body, such as a failed health report, as details', () => {
      const report = {
        status: 'error',
        error: { database: { status: 'down' } },
      };

      const { status, body } = overHttp(
        new ServiceUnavailableException(report),
      );

      expect(status).toBe(503);
      expect(body.details).toEqual(report);
    });
  });

  describe('logging', () => {
    let logged: jest.SpyInstance;
    beforeEach(() => {
      logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    });
    afterEach(() => logged.mockRestore());

    it('logs the stack of an unexpected error', () => {
      overHttp(new Error('boom'));

      expect(logged).toHaveBeenCalledWith(
        'boom',
        expect.stringContaining('Error: boom'),
      );
    });

    it('leaves deliberate errors to be logged where they were raised', () => {
      overHttp(new ServiceUnavailableException());
      overHttp(
        new RpcException({ status: 502, message: 'Payment provider error' }),
      );

      expect(logged).not.toHaveBeenCalled();
    });
  });

  describe('over RPC', () => {
    it('replies to an HttpException with its status, not "Internal server error"', async () => {
      await expect(
        overRpc(new NotFoundException('Reservation not found')),
      ).resolves.toEqual({
        status: 404,
        message: 'Reservation not found',
      });
    });

    it('passes an RpcException payload through', async () => {
      await expect(
        overRpc(new RpcException({ status: 409, message: 'Keys reused.' })),
      ).resolves.toEqual({ status: 409, message: 'Keys reused.' });
    });

    it('replies to an unexpected error with a bare 500', async () => {
      await expect(overRpc(new TypeError('x is undefined'))).resolves.toEqual({
        status: 500,
        message: 'Internal server error',
      });
    });
  });
});
