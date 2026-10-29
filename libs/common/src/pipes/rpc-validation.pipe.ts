import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

/**
 * ValidationPipe for message handlers. The stock pipe throws a
 * BadRequestException, which the RPC exception filter does not recognise and
 * replies to as "Internal server error". This raises an RpcException carrying
 * an HTTP-style status instead, so the caller can tell bad input from a fault.
 */
export class RpcValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      exceptionFactory: (errors) =>
        new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: errors.flatMap((error) =>
            Object.values(error.constraints ?? {}),
          ),
        }),
    });
  }
}
