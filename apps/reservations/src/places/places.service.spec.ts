import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlacesService } from './places.service';
import { PlacesRepository } from './places.repository';
import { ReservationsRepository } from '../reservations.repository';

describe('PlacesService', () => {
  let places: { findOne: jest.Mock };
  let reservations: { findBlocking: jest.Mock };
  let service: PlacesService;

  const from = new Date('2026-12-01');
  const to = new Date('2026-12-31');

  beforeEach(() => {
    places = { findOne: jest.fn().mockResolvedValue({ id: 3 }) };
    reservations = { findBlocking: jest.fn().mockResolvedValue([]) };
    service = new PlacesService(
      places as unknown as PlacesRepository,
      reservations as unknown as ReservationsRepository,
    );
  });

  it('reports a free place as available', async () => {
    await expect(service.availability(3, from, to)).resolves.toMatchObject({
      available: true,
      booked: [],
    });
  });

  it('lists booked stays without saying who booked them', async () => {
    const stay = {
      startDate: new Date('2026-12-05'),
      endDate: new Date('2026-12-08'),
    };
    reservations.findBlocking.mockResolvedValue([
      { ...stay, userId: 7, invoiceId: 'pi_1' },
    ]);

    const result = await service.availability(3, from, to);

    expect(reservations.findBlocking).toHaveBeenCalledWith(3, from, to);
    expect(result.available).toBe(false);
    expect(result.booked).toEqual([stay]);
  });

  it('refuses a window longer than a year', async () => {
    await expect(
      service.availability(3, from, new Date('2028-01-01')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 404 for an unknown place', async () => {
    places.findOne.mockRejectedValue(new NotFoundException());

    await expect(service.availability(99, from, to)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(reservations.findBlocking).not.toHaveBeenCalled();
  });
});
