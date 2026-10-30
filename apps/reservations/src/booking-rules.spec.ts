import { BadRequestException } from '@nestjs/common';
import {
  DAY_MS,
  MAX_NIGHTS,
  nightsForStay,
  startOfTodayUtc,
  wholeDaysBetween,
} from './booking-rules';

describe('booking rules', () => {
  const now = new Date('2026-11-10T15:30:00Z');
  const date = (iso: string) => new Date(iso);

  it('counts nights between check-in and check-out', () => {
    expect(nightsForStay(date('2026-11-12'), date('2026-11-15'), now)).toBe(3);
  });

  it('allows checking in today', () => {
    expect(nightsForStay(date('2026-11-10'), date('2026-11-11'), now)).toBe(1);
  });

  it('rejects a check-in in the past', () => {
    expect(() =>
      nightsForStay(date('2026-11-09'), date('2026-11-11'), now),
    ).toThrow(BadRequestException);
  });

  it('rejects zero or negative nights', () => {
    expect(() =>
      nightsForStay(date('2026-11-12'), date('2026-11-12'), now),
    ).toThrow('endDate must be after startDate');
  });

  it(`rejects more than ${MAX_NIGHTS} nights`, () => {
    const start = date('2026-11-12');
    const end = new Date(start.getTime() + (MAX_NIGHTS + 1) * DAY_MS);
    expect(() => nightsForStay(start, end, now)).toThrow(BadRequestException);
  });

  it('rejects a time of day, so a night cannot be stretched', () => {
    expect(() =>
      wholeDaysBetween(
        date('2026-11-12T00:00:00Z'),
        date('2026-11-13T01:00:00Z'),
      ),
    ).toThrow('Dates must be calendar dates');
  });

  it('finds the start of the UTC day', () => {
    expect(startOfTodayUtc(now)).toEqual(date('2026-11-10T00:00:00Z'));
  });
});
