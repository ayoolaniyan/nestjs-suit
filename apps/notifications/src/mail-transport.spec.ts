import { ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import * as nodemailer from 'nodemailer';
import { createMailTransport, mailValidationSchema } from './mail-transport';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('mail transport', () => {
  const schema = Joi.object(mailValidationSchema);
  const config = (values: Record<string, unknown>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  beforeEach(() => jest.mocked(nodemailer.createTransport).mockClear());

  it('connects to the configured SMTP server, authenticating when a user is set', () => {
    createMailTransport(
      config({
        MAIL_TRANSPORT: 'smtp',
        SMTP_HOST: 'email-smtp.us-east-1.amazonaws.com',
        SMTP_PORT: 587,
        SMTP_SECURE: false,
        SMTP_USER: 'AKIAEXAMPLE',
        SMTP_PASSWORD: 'smtp-password',
      }),
    );

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'email-smtp.us-east-1.amazonaws.com',
      port: 587,
      secure: false,
      auth: { user: 'AKIAEXAMPLE', pass: 'smtp-password' },
    });
  });

  it('connects without credentials when no SMTP user is set', () => {
    createMailTransport(
      config({ MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'mailpit' }),
    );

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'mailpit', auth: undefined }),
    );
  });

  it('uses Gmail with OAuth2 when asked', () => {
    createMailTransport(
      config({ MAIL_TRANSPORT: 'gmail', SMTP_USER: 'a@gmail.com' }),
    );

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'gmail',
        auth: expect.objectContaining({ type: 'OAuth2', user: 'a@gmail.com' }),
      }),
    );
  });

  it('requires a host for SMTP and the OAuth settings for Gmail', () => {
    const base = { MAIL_FROM: 'bookings@example.com' };

    expect(
      schema.validate({ ...base, MAIL_TRANSPORT: 'smtp' }).error?.message,
    ).toContain('SMTP_HOST');
    expect(
      schema.validate({ ...base, MAIL_TRANSPORT: 'gmail', SMTP_HOST: 'x' })
        .error?.message,
    ).toContain('SMTP_USER');
    expect(
      schema.validate({ ...base, MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'mailpit' })
        .error,
    ).toBeUndefined();
  });
});
