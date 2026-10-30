import { BadRequestException } from '@nestjs/common';
import { User } from '@app/common';
import { ReservationsController } from './reservations.controller';
import { CreateReservationDto } from './dto/create-reservation.dto';

describe('ReservationsController', () => {
  const user = new User({ id: 7 });
  const dto = { placeId: 3 } as CreateReservationDto;
  let service: { create: jest.Mock; cancel: jest.Mock };
  let controller: ReservationsController;

  beforeEach(() => {
    service = { create: jest.fn(), cancel: jest.fn() };
    controller = new ReservationsController(service as any);
  });

  it('passes the Idempotency-Key to the booking', async () => {
    await controller.create(dto, user, 'key-1');

    expect(service.create).toHaveBeenCalledWith(dto, user, 'key-1');
  });

  it('books without a key when none is sent', async () => {
    await controller.create(dto, user);

    expect(service.create).toHaveBeenCalledWith(dto, user, undefined);
  });

  it("refuses a key longer than Stripe's 255-character limit", async () => {
    await expect(
      controller.create(dto, user, 'k'.repeat(256)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('cancels on behalf of the signed-in user', async () => {
    await controller.cancel(5, user);

    expect(service.cancel).toHaveBeenCalledWith(5, user);
  });
});
