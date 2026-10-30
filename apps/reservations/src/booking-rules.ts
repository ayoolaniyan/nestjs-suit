import { BadRequestException } from '@nestjs/common';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_NIGHTS = 30;
/** Widest window the availability endpoint will answer for. */
export const MAX_AVAILABILITY_DAYS = 366;

/**
 * How long a pending reservation holds its dates. Long enough to cover the
 * charge (payments times out after 15s), short enough that a process that
 * died mid-booking does not block the place for good.
 */
export const PENDING_HOLD_MS = 15 * 60 * 1000;

const isUtcMidnight = (date: Date) => date.getTime() % DAY_MS === 0;

export function startOfTodayUtc(now = new Date()): Date {
  return new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
}

/**
 * Validates a date range of whole days and returns how many days it spans.
 * Dates are sent as YYYY-MM-DD, which parse to UTC midnight; anything with a
 * time of day is refused so that "one night" cannot mean 25 hours.
 */
export function wholeDaysBetween(start: Date, end: Date): number {
  if (!isUtcMidnight(start) || !isUtcMidnight(end)) {
    throw new BadRequestException(
      'Dates must be calendar dates in the form YYYY-MM-DD',
    );
  }
  const days = (end.getTime() - start.getTime()) / DAY_MS;
  if (days < 1) {
    throw new BadRequestException('endDate must be after startDate');
  }
  return days;
}

/** Validates a stay and returns the number of nights. */
export function nightsForStay(
  startDate: Date,
  endDate: Date,
  now = new Date(),
): number {
  const nights = wholeDaysBetween(startDate, endDate);
  if (nights > MAX_NIGHTS) {
    throw new BadRequestException(`A stay can be at most ${MAX_NIGHTS} nights`);
  }
  if (startDate < startOfTodayUtc(now)) {
    throw new BadRequestException('startDate must not be in the past');
  }
  return nights;
}
