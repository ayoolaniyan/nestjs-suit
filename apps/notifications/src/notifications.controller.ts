import { Controller, UsePipes } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { EventPattern, Payload } from '@nestjs/microservices';
import { RpcValidationPipe } from '@app/common';
import { NotifyEmailDto } from './dto/notify-email.dto';

@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UsePipes(new RpcValidationPipe())
  @EventPattern('notify_email')
  async notifyEmail(@Payload() data: NotifyEmailDto) {
    // Awaited so a failed send is reported by Nest's event error handling
    // instead of surfacing as an unhandled promise rejection.
    await this.notificationsService.notifyEmail(data);
  }
}
