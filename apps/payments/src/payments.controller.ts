import { Controller, UsePipes } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RpcValidationPipe } from '@app/common';
import { PaymentCreateChargeDto } from './dto/payments-create-charge.dto';
import { RefundChargeDto } from './dto/refund-charge.dto';

@Controller()
@UsePipes(new RpcValidationPipe())
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @MessagePattern('create_charge')
  async createCharge(@Payload() data: PaymentCreateChargeDto) {
    return this.paymentsService.createCharge(data);
  }

  @MessagePattern('refund_charge')
  async refundCharge(@Payload() data: RefundChargeDto) {
    return this.paymentsService.refundCharge(data);
  }
}
