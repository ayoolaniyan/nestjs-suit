import { ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import * as nodemailer from 'nodemailer';

export enum MailTransport {
  /** Any SMTP server: Amazon SES's SMTP endpoint, Mailpit in development. */
  Smtp = 'smtp',
  /** Gmail with OAuth2, as before SMTP was supported. */
  Gmail = 'gmail',
}

const requiredFor = (transport: MailTransport) =>
  Joi.string().when('MAIL_TRANSPORT', {
    is: transport,
    then: Joi.required(),
  });

export const mailValidationSchema = {
  MAIL_TRANSPORT: Joi.string()
    .valid(...Object.values(MailTransport))
    .required(),
  // The sender. With Gmail it must be the account in SMTP_USER.
  MAIL_FROM: Joi.string().required(),
  SMTP_HOST: requiredFor(MailTransport.Smtp),
  SMTP_PORT: Joi.number().default(587),
  // true for implicit TLS (port 465); otherwise STARTTLS is used if offered.
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: requiredFor(MailTransport.Gmail),
  SMTP_PASSWORD: Joi.string(),
  GOOGLE_OAUTH_CLIENT_ID: requiredFor(MailTransport.Gmail),
  GOOGLE_OAUTH_CLIENT_SECRET: requiredFor(MailTransport.Gmail),
  GOOGLE_OAUTH_REFRESH_TOKEN: requiredFor(MailTransport.Gmail),
};

export function createMailTransport(configService: ConfigService) {
  if (configService.get('MAIL_TRANSPORT') === MailTransport.Gmail) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: configService.get('SMTP_USER'),
        clientId: configService.get('GOOGLE_OAUTH_CLIENT_ID'),
        clientSecret: configService.get('GOOGLE_OAUTH_CLIENT_SECRET'),
        refreshToken: configService.get('GOOGLE_OAUTH_REFRESH_TOKEN'),
      },
    });
  }

  const user = configService.get<string>('SMTP_USER');
  return nodemailer.createTransport({
    host: configService.get<string>('SMTP_HOST'),
    port: configService.get<number>('SMTP_PORT'),
    secure: configService.get<boolean>('SMTP_SECURE'),
    // Unauthenticated when no user is set (a local Mailpit, say).
    auth: user
      ? { user, pass: configService.get<string>('SMTP_PASSWORD') }
      : undefined,
  });
}
