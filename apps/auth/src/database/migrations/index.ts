import { InitialAuthSchema1793306644521 } from './1793306644521-InitialAuthSchema';
import { SeedAdminRole1793306644522 } from './1793306644522-SeedAdminRole';
import { AddSessions1793380358447 } from './1793380358447-AddSessions';

// In the order they must run. New migrations are generated with the
// `typeorm:auth` script and added here.
export const migrations = [
  InitialAuthSchema1793306644521,
  SeedAdminRole1793306644522,
  AddSessions1793380358447,
];
