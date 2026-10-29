import { DatabaseModuleOptions } from '@app/common';
import { migrations } from './migrations';

export const reservationsDatabaseOptions: DatabaseModuleOptions = {
  migrations,
  migrationsTableName: 'migrations_reservations',
};
