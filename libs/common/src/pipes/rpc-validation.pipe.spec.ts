import { RpcException } from '@nestjs/microservices';
import { CreateChargeDto } from '../dto/create-charge.dto';
import { RpcValidationPipe } from './rpc-validation.pipe';

describe('RpcValidationPipe', () => {
  const pipe = new RpcValidationPipe();
  const metadata = { type: 'body' as const, metatype: CreateChargeDto };

  it('raises an RpcException with a 400 status for invalid input', async () => {
    const error = await pipe
      .transform({ paymentMethodId: 'pm_1', amount: 10.001 }, metadata)
      .catch((e) => e);

    expect(error).toBeInstanceOf(RpcException);
    expect(error.getError()).toMatchObject({ status: 400 });
  });

  it('rejects amounts below the Stripe minimum', async () => {
    await expect(
      pipe.transform({ paymentMethodId: 'pm_1', amount: 0.1 }, metadata),
    ).rejects.toBeInstanceOf(RpcException);
  });

  it('passes valid input through', async () => {
    await expect(
      pipe.transform({ paymentMethodId: 'pm_1', amount: 19.99 }, metadata),
    ).resolves.toMatchObject({ amount: 19.99 });
  });
});
