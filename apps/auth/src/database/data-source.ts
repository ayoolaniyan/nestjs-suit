/**
 * Entry point for the TypeORM CLI only (see the `typeorm:auth` script); the
 * running service connects through DatabaseModule. Reads the same MYSQL_*
 * variables from the environment.
 */
import { DataSource } from 'typeorm';
import { Role, User } from '@app/common';
import { authDatabaseOptions } from './database.options';

export default new DataSource({
  type: 'mysql',
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT),
  database: process.env.MYSQL_DATABASE,
  username: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  entities: [User, Role],
  ...authDatabaseOptions,
});
