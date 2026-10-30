import { AbstractRepository } from '@app/common';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Place } from './place.entity';

@Injectable()
export class PlacesRepository extends AbstractRepository<Place> {
  protected readonly logger = new Logger(PlacesRepository.name);

  constructor(
    @InjectRepository(Place) placeRepository: Repository<Place>,
    entityManager: EntityManager,
  ) {
    super(placeRepository, entityManager);
  }
}
