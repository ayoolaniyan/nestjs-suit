import { Column, Entity } from 'typeorm';
import { AbstractEntity } from '../database';

@Entity()
export class Role extends AbstractEntity<Role> {
  @Column({ unique: true })
  name: string;
}
