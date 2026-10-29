import { Test } from '@nestjs/testing';
import {
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';

describe('UsersService', () => {
  let service: UsersService;
  let repository: {
    create: jest.Mock;
    findOne: jest.Mock;
    findOneOrNull: jest.Mock;
    exists: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      create: jest.fn((user) => Promise.resolve({ id: 1, ...user })),
      findOne: jest.fn(),
      findOneOrNull: jest.fn(),
      exists: jest.fn().mockResolvedValue(false),
      find: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repository },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('create', () => {
    it('hashes the password before it reaches the repository', async () => {
      await service.create({
        email: 'user@example.com',
        password: 'plain-text-password',
      } as never);

      const [persisted] = repository.create.mock.calls[0];
      expect(persisted.password).not.toBe('plain-text-password');
      expect(
        await bcrypt.compare('plain-text-password', persisted.password),
      ).toBe(true);
    });

    it('never persists roles supplied by the caller', async () => {
      await service.create({
        email: 'user@example.com',
        password: 'plain-text-password',
        roles: [{ name: 'Admin' }],
      } as never);

      const [persisted] = repository.create.mock.calls[0];
      expect(persisted.roles).toBeUndefined();
    });

    it('refuses an email that already exists', async () => {
      repository.exists.mockResolvedValue(true);

      await expect(
        service.create({
          email: 'taken@example.com',
          password: 'plain-text-password',
        } as never),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyUser', () => {
    it('returns the user when the password matches', async () => {
      const password = 'plain-text-password';
      repository.findOneOrNull.mockResolvedValue({
        id: 1,
        email: 'user@example.com',
        password: await bcrypt.hash(password, 10),
      });

      await expect(
        service.verifyUser('user@example.com', password),
      ).resolves.toMatchObject({ id: 1 });
    });

    it('rejects a wrong password', async () => {
      repository.findOneOrNull.mockResolvedValue({
        id: 1,
        email: 'user@example.com',
        password: await bcrypt.hash('the-real-password', 10),
      });

      await expect(
        service.verifyUser('user@example.com', 'guessed'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown email with the same error as a wrong password', async () => {
      repository.findOneOrNull.mockResolvedValue(null);
      const compare = jest.spyOn(bcrypt, 'compare');

      await expect(
        service.verifyUser('nobody@example.com', 'guessed'),
      ).rejects.toThrow(new UnauthorizedException('Credentials are not valid'));
      // Still hashes, so the response time does not reveal the miss.
      expect(compare).toHaveBeenCalled();
    });
  });
});
