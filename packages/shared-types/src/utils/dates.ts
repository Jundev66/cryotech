/** Date helpers for reports and receivables. All of them work on whole days. */

/** The farm's zone. A day's sales, and whether one is overdue, follow its calendar. */
const FARM_TIME_ZONE = 'America/Caracas';

/** `YYYY-MM-DD`, the form every API response uses for a date. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Today in the farm's calendar, as that day's UTC midnight.
 *
 * That is the exact instant a DATE column holds for the day, so `dueDate <
 * today` means "due before today". The previous local-midnight version was
 * 04:00 UTC in Caracas, which made every sale overdue on its own due date, and
 * on a UTC server it rolled over to tomorrow at 8 pm Caracas time.
 */
export function startOfToday(timeZone: string = FARM_TIME_ZONE, now: Date = new Date()): Date {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Whole days between two instants; never negative, so a future date reads 0. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}
