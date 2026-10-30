import { Controller, UsePipes } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  PAYMENT_FAILED,
  PAYMENT_SUCCEEDED,
  PaymentOutcomeDto,
  RpcValidationPipe,
} from '@app/common';
import { ReservationsService } from './reservations.service';

/** Charge outcomes from Stripe's webhooks, relayed by payments over TCP. */
@Controller()
@UsePipes(new RpcValidationPipe())
export class PaymentEventsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @MessagePattern(PAYMENT_SUCCEEDED)
  async paymentSucceeded(@Payload() outcome: PaymentOutcomeDto) {
    return this.reservationsService.recordPaymentSucceeded(outcome);
  }

  @MessagePattern(PAYMENT_FAILED)
  async paymentFailed(@Payload() outcome: PaymentOutcomeDto) {
    return this.reservationsService.recordPaymentFailed(outcome);
  }
}
