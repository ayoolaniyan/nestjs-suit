import { AddPlacesAndBookingLifecycle1793309686040 } from './1793309686040-AddPlacesAndBookingLifecycle';
import { InitialReservationsSchema1793306648838 } from './1793306648838-InitialReservationsSchema';
import { AddReservationEmail1793380361835 } from './1793380361835-AddReservationEmail';

// In the order they must run. New migrations are generated with the
// `typeorm:reservations` script and added here.
export const migrations = [
  InitialReservationsSchema1793306648838,
  AddPlacesAndBookingLifecycle1793309686040,
  AddReservationEmail1793380361835,
];
