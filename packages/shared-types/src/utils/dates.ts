/** Date helpers for reports and receivables. All of them work on whole days. */

/** `YYYY-MM-DD`, the form every API response uses for a date. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/** Whole days between two instants; never negative, so a future date reads 0. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}
