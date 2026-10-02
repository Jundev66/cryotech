/**
 * Today in the browser's calendar, as `YYYY-MM-DD`.
 *
 * `toISOString()` is UTC: after 8 pm in Venezuela it is already tomorrow, and a
 * sale or a payment entered in the evening landed on the next day.
 */
export function todayLocalIso(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
