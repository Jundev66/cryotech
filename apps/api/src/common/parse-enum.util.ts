import { BadRequestException } from '@nestjs/common';

/**
 * Narrows a raw query-string value to a member of a Prisma enum.
 *
 * List filters arrive from the URL as unvalidated strings. Feeding one straight
 * into a Prisma enum filter turns `?status=pendinng` into a 500 from the query
 * engine; this turns it into a 400 that names the accepted values.
 */
export function parseEnum<T extends Record<string, string>>(
  values: T,
  raw: string | undefined,
  field: string,
): T[keyof T] | undefined {
  if (raw === undefined || raw === '') return undefined;

  const allowed = Object.values(values);
  if (!allowed.includes(raw)) {
    throw new BadRequestException(`${field} debe ser uno de: ${allowed.join(', ')}`);
  }
  return raw as T[keyof T];
}
