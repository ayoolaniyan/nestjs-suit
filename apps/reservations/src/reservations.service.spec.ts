import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { TimeoutError, of, throwError } from 'rxjs';
import { PAYMENTS_SERVICE, Role, User } from '@app/common';
import { ReservationsService } from './reservations.service';
import { ReservationsRepository } from './reservations.repository';
import { CreateReservationDto } from './dto/create-reservation.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('ReservationsService', () => {
  let service: ReservationsService;
  let payments: { send: jest.Mock };
  let repository: {
    create: jest.Mock;
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

  const inDays = (days: number) => new Date(Date.now() + days * DAY_MS);
  const booking = (): CreateReservationDto => ({
    startDate: inDays(1),
    endDate: inDays(3),
    charge: { amount: 20, paymentMethodId: 'pm_from_client' },
  });

  beforeEach(async () => {
    payments = { send: jest.fn().mockReturnValue(of({ id: 'pi_123' })) };
    repository = {
      create: jest.fn((reservation) => Promise.resolve(reservation)),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findOneAndDelete: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: ReservationsRepository, useValue: repository },
        { provide: PAYMENTS_SERVICE, useValue: payments },
      ],
    }).compile();

    service = moduleRef.get(ReservationsService);
  });

  describe('create', () => {
    it('charges, then saves the reservation against the payment intent', async () => {
      const saved = await service.create(booking(), owner, 'key-1');

      expect(payments.send).toHaveBeenCalledWith('create_charge', {
        amount: 20,
        paymentMethodId: 'pm_from_client',
        email: 'owner@example.com',
        idempotencyKey: 'key-1',
      });
      expect(saved).toMatchObject({ userId: 7, invoiceId: 'pi_123' });
      expect(saved).not.toHaveProperty('charge');
    });

    it('refunds the charge when the reservation cannot be saved', async () => {
      repository.create.mockRejectedValue(new Error('deadlock'));
      payments.send.mockImplementation((pattern) =>
        of(pattern === 'create_charge' ? { id: 'pi_123' } : {}),
      );

      await expect(service.create(booking(), owner)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(payments.send).toHaveBeenCalledWith('refund_charge', {
        paymentIntentId: 'pi_123',
      });
    });

    it('rejects an end date that is not after the start date', async () => {
      const dto = { ...booking(), endDate: inDays(1) };

      await expect(service.create(dto, owner)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(payments.send).not.toHaveBeenCalled();
    });

    it('rejects a start date in the past', async () => {
      const dto = { ...booking(), startDate: inDays(-1) };

      await expect(service.create(dto, owner)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(payments.send).not.toHaveBeenCalled();
    });

    it('passes a payment failure through with its status', async () => {
      payments.send.mockReturnValue(
        throwError(() => ({ status: 402, message: 'Your card was declined.' })),
      );

      const error = await service.create(booking(), owner).catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(402);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('answers 504 when the payment service times out', async () => {
      payments.send.mockReturnValue(throwError(() => new TimeoutError()));

      await expect(service.create(booking(), owner)).rejects.toBeInstanceOf(
        GatewayTimeoutException,
      );
    });
  });

  describe('update', () => {
    it('checks a new end date against the stored start date', async () => {
      repository.findOne.mockResolvedValue({
        id: 3,
        startDate: inDays(5),
        endDate: inDays(6),
      });

      await expect(
        service.update(3, { endDate: inDays(4) }, owner),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.findOneAndUpdate).not.toHaveBeenCalled();
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

    it('updates only within their own reservations', async () => {
      await service.update(3, {}, owner);
      expect(repository.findOneAndUpdate).toHaveBeenCalledWith(
        { id: 3, userId: 7 },
        {},
      );
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
