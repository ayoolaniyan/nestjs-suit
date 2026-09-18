import { Logger, NotFoundException } from '@nestjs/common';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AbstractEntity } from './abstract.entity';

export abstract class AbstractRepository<T extends AbstractEntity<T>> {
  // Subclasses override this with a named logger. It is initialised here so
  // that a subclass which forgets to still logs rather than throwing
  // "cannot read properties of undefined" from inside an error path.
  protected readonly logger: Logger = new Logger(AbstractRepository.name);

  constructor(
    private readonly entityRepository: Repository<T>,
    private readonly entityManager: EntityManager,
  ) {}

  async create(entity: T): Promise<T> {
    return this.entityManager.save(entity);
  }

  async findOne(where: FindOptionsWhere<T>): Promise<T> {
    const entity = await this.entityRepository.findOne({ where });

    if (!entity) {
      this.logger.warn('Entity not found with where', where);
      throw new NotFoundException('Entity not found');
    }
    return entity;
  }

  async findOneAndUpdate(
    where: FindOptionsWhere<T>,
    partialEntity: QueryDeepPartialEntity<T>,
  ): Promise<T> {
    const updatedResult = await this.entityRepository.update(
      where,
      partialEntity,
    );

    if (!updatedResult.affected) {
      this.logger.warn('Entity not found in where', where);
      throw new NotFoundException('Entity was not found');
    }
    return this.findOne(where);
  }

  async find(where: FindOptionsWhere<T>): Promise<T[]> {
    return this.entityRepository.findBy(where);
  }

  async findOneAndDelete(where: FindOptionsWhere<T>): Promise<void> {
    const result = await this.entityRepository.delete(where);

    if (!result.affected) {
      this.logger.warn('Entity not found in where', where);
      throw new NotFoundException('Entity was not found');
    }
  }
}
