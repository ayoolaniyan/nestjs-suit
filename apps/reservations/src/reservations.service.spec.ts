import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { TimeoutError, of, throwError } from 'rxjs';
import { QueryFailedError } from 'typeorm';
import { PAYMENTS_SERVICE, Role, User } from '@app/common';
import { ReservationsService } from './reservations.service';
import { ReservationsRepository } from './reservations.repository';
import { PlacesRepository } from './places/places.repository';
import { Reservation, ReservationStatus } from './models/reservation.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { DAY_MS, startOfTodayUtc } from './booking-rules';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let payments: { send: jest.Mock };
  let places: { findOne: jest.Mock };
  let repository: {
    findOneOrNull: jest.Mock;
    holdIfAvailable: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findOneAndDelete: jest.Mock;
  };

  const owner = new User({ id: 7, email: 'owner@example.com', roles: [] });
  const admin = new User({
    id: 1,
    email: 'admin@example.com',
    roles: [new Role({ id: 1, name: 'Admin' })],
  });

  /** UTC midnight, `days` from today. */
  const day = (days: number) =>
    new Date(startOfTodayUtc().getTime() + days * DAY_MS);
  const booking = (): CreateReservationDto => ({
    placeId: 3,
    startDate: day(1),
    endDate: day(4),
    paymentMethodId: 'pm_from_client',
  });

  /** Replies to create_charge and refund_charge as Stripe would. */
  const paymentsReply = (pattern: string) =>
    of(pattern === 'create_charge' ? { id: 'pi_1' } : { id: 're_1' });

  beforeEach(async () => {
    payments = { send: jest.fn().mockImplementation(paymentsReply) };
    places = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 3, pricePerNightCents: 12500 }),
    };
    repository = {
      findOneOrNull: jest.fn().mockResolvedValue(null),
      holdIfAvailable: jest.fn((reservation: Reservation) =>
        Promise.resolve(Object.assign(reservation, { id: 11 })),
      ),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn((where, changes) =>
        Promise.resolve({ ...where, ...changes }),
      ),
      findOneAndDelete: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: ReservationsRepository, useValue: repository },
        { provide: PlacesRepository, useValue: places },
        { provide: PAYMENTS_SERVICE, useValue: payments },
      ],
    }).compile();

    service = moduleRef.get(ReservationsService);
  });

  describe('create', () => {
    it('prices the stay itself, holds the dates, charges, then confirms', async () => {
      const result = await service.create(booking(), owner);

      const [held] = repository.holdIfAvailable.mock.calls[0];
      expect(held).toMatchObject({
        placeId: 3,
        userId: 7,
        status: ReservationStatus.Pending,
        // 3 nights at $125.00
        amountCents: 37500,
      });
      expect(payments.send).toHaveBeenCalledWith('create_charge', {
        paymentMethodId: 'pm_from_client',
        amountCents: 37500,
        email: 'owner@example.com',
        idempotencyKey: 'reservation-11-charge',
      });
      expect(result).toMatchObject({
        status: ReservationStatus.Confirmed,
        invoiceId: 'pi_1',
      });
    });

    it('releases the dates when the card is declined', async () => {
      payments.send.mockReturnValue(
        throwError(() => ({ status: 402, message: 'Your card was declined.' })),
      );

      const error = await service.create(booking(), owner).catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(402);
      expect(repository.findOneAndUpdate).toHaveBeenCalledWith(
        { id: 11 },
        { status: ReservationStatus.Failed },
      );
    });

    it('keeps holding the dates when the charge outcome is unknown', async () => {
      payments.send.mockReturnValue(throwError(() => new TimeoutError()));

      await expect(service.create(booking(), owner)).rejects.toBeInstanceOf(
        GatewayTimeoutException,
      );
      // The charge may have succeeded, so the dates must not be released.
      expect(repository.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('refunds the charge when the booking cannot be confirmed', async () => {
      repository.findOneAndUpdate
        .mockRejectedValueOnce(new Error('deadlock'))
        .mockResolvedValue({});

      await expect(service.create(booking(), owner)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(payments.send).toHaveBeenCalledWith('refund_charge', {
        paymentIntentId: 'pi_1',
        idempotencyKey: 'reservation-11-refund',
      });
      expect(repository.findOneAndUpdate).toHaveBeenLastCalledWith(
        { id: 11 },
        { status: ReservationStatus.Failed },
      );
    });

    it('rejects dates that are not whole days, before holding anything', async () => {
      const dto = { ...booking(), startDate: new Date(day(1).getTime() + 1) };

      await expect(service.create(dto, owner)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.holdIfAvailable).not.toHaveBeenCalled();
    });

    it('turns a duplicate Idempotency-Key race into a 409', async () => {
      repository.holdIfAvailable.mockRejectedValue(
        new QueryFailedError('INSERT', [], {
          code: 'ER_DUP_ENTRY',
        } as unknown as Error),
      );

      await expect(
        service.create(booking(), owner, 'key-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(payments.send).not.toHaveBeenCalled();
    });

    describe('with a repeated Idempotency-Key', () => {
      const previous = (status: ReservationStatus) =>
        new Reservation({
          id: 5,
          userId: 7,
          status,
          amountCents: 37500,
          idempotencyKey: 'key-1',
        });

      it('returns a confirmed booking without charging again', async () => {
        const confirmed = previous(ReservationStatus.Confirmed);
        repository.findOneOrNull.mockResolvedValue(confirmed);

        await expect(service.create(booking(), owner, 'key-1')).resolves.toBe(
          confirmed,
        );
        expect(payments.send).not.toHaveBeenCalled();
        expect(repository.holdIfAvailable).not.toHaveBeenCalled();
      });

      it('retries a pending booking with the same Stripe idempotency key', async () => {
        repository.findOneOrNull.mockResolvedValue(
          previous(ReservationStatus.Pending),
        );

        await service.create(booking(), owner, 'key-1');

        expect(repository.holdIfAvailable).not.toHaveBeenCalled();
        expect(payments.send).toHaveBeenCalledWith(
          'create_charge',
          expect.objectContaining({ idempotencyKey: 'reservation-5-charge' }),
        );
      });

      it('refuses a key whose booking failed', async () => {
        repository.findOneOrNull.mockResolvedValue(
          previous(ReservationStatus.Failed),
        );

        await expect(
          service.create(booking(), owner, 'key-1'),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it("looks the key up only among the caller's own bookings", async () => {
        await service.create(booking(), owner, 'key-1');

        expect(repository.findOneOrNull).toHaveBeenCalledWith({
          userId: 7,
          idempotencyKey: 'key-1',
        });
      });
    });
  });

  describe('cancel', () => {
    const confirmed = (startDate: Date) =>
      new Reservation({
        id: 5,
        userId: 7,
        status: ReservationStatus.Confirmed,
        startDate,
        invoiceId: 'pi_1',
      });

    it('refunds and cancels a confirmed reservation before check-in', async () => {
      repository.findOne.mockResolvedValue(confirmed(day(2)));

      const result = await service.cancel(5, owner);

      expect(payments.send).toHaveBeenCalledWith('refund_charge', {
        paymentIntentId: 'pi_1',
        idempotencyKey: 'reservation-5-refund',
      });
      expect(result).toMatchObject({
        status: ReservationStatus.Cancelled,
        refundId: 're_1',
      });
    });

    it('refuses once the stay has started', async () => {
      repository.findOne.mockResolvedValue(confirmed(day(0)));

      await expect(service.cancel(5, owner)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(payments.send).not.toHaveBeenCalled();
    });

    it('refuses a reservation that is not confirmed', async () => {
      repository.findOne.mockResolvedValue(
        new Reservation({ id: 5, status: ReservationStatus.Cancelled }),
      );

      await expect(service.cancel(5, owner)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("looks only within the caller's own reservations", async () => {
      repository.findOne.mockResolvedValue(confirmed(day(2)));

      await service.cancel(5, owner);

      expect(repository.findOne).toHaveBeenCalledWith({ id: 5, userId: 7 });
    });
  });

  describe('for a regular user', () => {
    it('lists only their own reservations', async () => {
      await service.findAll(owner);
      expect(repository.find).toHaveBeenCalledWith({ userId: 7 });
    });

    it('looks up a single reservation within their own', async () => {
      await service.findOne(3, owner);
      expect(repository.findOne).toHaveBeenCalledWith({ id: 3, userId: 7 });
    });

    it('deletes only within their own reservations', async () => {
      await service.remove(3, owner);
      expect(repository.findOneAndDelete).toHaveBeenCalledWith({
        id: 3,
        userId: 7,
      });
    });
  });

  describe('for an admin', () => {
    it('lists every reservation', async () => {
      await service.findAll(admin);
      expect(repository.find).toHaveBeenCalledWith({});
    });

    it('can reach any reservation by id', async () => {
      await service.findOne(3, admin);
      expect(repository.findOne).toHaveBeenCalledWith({ id: 3 });
    });
  });
});
