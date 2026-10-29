import { Test } from '@nestjs/testing';
import { PAYMENTS_SERVICE, User } from '@app/common';
import { ReservationsService } from './reservations.service';
import { ReservationsRepository } from './reservations.repository';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let repository: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findOneAndDelete: jest.Mock;
  };

  const owner = { id: 7, email: 'owner@example.com', roles: [] } as User;
  const admin = {
    id: 1,
    email: 'admin@example.com',
    roles: [{ id: 1, name: 'Admin' }],
  } as User;

  beforeEach(async () => {
    repository = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findOneAndDelete: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: ReservationsRepository, useValue: repository },
        { provide: PAYMENTS_SERVICE, useValue: { send: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(ReservationsService);
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
