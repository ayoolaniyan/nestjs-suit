import { NotFoundException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { AbstractRepository } from './abstract.repository';
import { AbstractEntity } from './abstract.entity';

class Widget extends AbstractEntity<Widget> {
  name: string;
}

class WidgetRepository extends AbstractRepository<Widget> {}

describe('AbstractRepository', () => {
  let entityRepository: {
    findOne: jest.Mock;
    findBy: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let entityManager: { save: jest.Mock };
  let repository: WidgetRepository;

  beforeEach(() => {
    entityRepository = {
      findOne: jest.fn(),
      findBy: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    entityManager = { save: jest.fn((entity) => Promise.resolve(entity)) };

    repository = new WidgetRepository(
      entityRepository as unknown as Repository<Widget>,
      entityManager as unknown as EntityManager,
    );
  });

  it('has a usable logger even when a subclass does not supply one', () => {
    // The base class previously declared `logger` without assigning it, so
    // the first log line inside any error path threw a TypeError and masked
    // the NotFoundException it was about to raise.
    expect(repository['logger']).toBeDefined();
  });

  it('raises NotFoundException when findOne matches nothing', async () => {
    entityRepository.findOne.mockResolvedValue(null);

    await expect(repository.findOne({ id: 1 } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('raises NotFoundException when an update affects no rows', async () => {
    entityRepository.update.mockResolvedValue({ affected: 0 });

    await expect(
      repository.findOneAndUpdate({ id: 1 } as never, { name: 'x' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the updated entity when an update affects a row', async () => {
    entityRepository.update.mockResolvedValue({ affected: 1 });
    entityRepository.findOne.mockResolvedValue({ id: 1, name: 'x' });

    await expect(
      repository.findOneAndUpdate({ id: 1 } as never, { name: 'x' } as never),
    ).resolves.toMatchObject({ id: 1, name: 'x' });
  });

  it('raises NotFoundException when a delete removes nothing', async () => {
    // Previously this returned successfully whether or not the row existed,
    // so callers could not tell a completed delete from a no-op.
    entityRepository.delete.mockResolvedValue({ affected: 0 });

    await expect(
      repository.findOneAndDelete({ id: 1 } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('completes when a delete removes a row', async () => {
    entityRepository.delete.mockResolvedValue({ affected: 1 });

    await expect(
      repository.findOneAndDelete({ id: 1 } as never),
    ).resolves.toBeUndefined();
  });
});
