import { DatabaseModuleOptions } from '@app/common';
import { migrations } from './migrations';

export const authDatabaseOptions: DatabaseModuleOptions = {
  migrations,
  migrationsTableName: 'migrations_auth',
};
