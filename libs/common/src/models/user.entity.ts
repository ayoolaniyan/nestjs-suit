import { Exclude } from 'class-transformer';
import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { AbstractEntity } from '../database';
import { Role } from './role.entity';

@Entity()
export class User extends AbstractEntity<User> {
  @Column({ unique: true })
  email: string;

  // Stripped by ClassSerializerInterceptor wherever a User leaves a service,
  // over HTTP or TCP. It is still available in-process for verifyUser.
  @Exclude({ toPlainOnly: true })
  @Column()
  password: string;

  // Eager so that every lookup carries the roles the JwtAuthGuard checks.
  // Without it the relation was never loaded and @Roles() always rejected.
  @ManyToMany(() => Role, { cascade: true, eager: true })
  @JoinTable()
  roles?: Role[];
}
