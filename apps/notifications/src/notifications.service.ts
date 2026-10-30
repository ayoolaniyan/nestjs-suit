import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transporter } from 'nodemailer';
import { NotifyEmailEvent } from '@app/common';
import { createMailTransport } from './mail-transport';
import { render } from './templates/render';

@Injectable()
export class NotificationsService {
  private readonly transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = createMailTransport(configService);
  }

  async notifyEmail(event: NotifyEmailEvent) {
    const { subject, text, html } = render(event);
    await this.transporter.sendMail({
      from: this.configService.getOrThrow<string>('MAIL_FROM'),
      to: event.email,
      subject,
      text,
      html,
    });
  }
}
