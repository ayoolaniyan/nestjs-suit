import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from './payments.service';

// Called by Stripe only; not part of the public API.
@ApiExcludeController()
@Controller('payments/webhook')
export class WebhooksController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    // The signature covers the exact bytes Stripe sent, hence the raw body
    // rather than the parsed one.
    return this.paymentsService.handleWebhook(request.rawBody, signature);
  }
}
