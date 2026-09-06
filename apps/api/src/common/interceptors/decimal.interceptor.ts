import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Sends Prisma's `Decimal` columns as numbers.
 *
 * `JSON.stringify` turns a Decimal into a **string**, while `shared-types`
 * declares every one of those ~28 fields as `number`. The types were lying, and
 * JavaScript hides the lie almost everywhere: `"12" - "5"` is 7 and `"12" * 2`
 * is 24, so subtraction and multiplication behave. Only `+` betrays it —
 * `"4000" + "500"` is `"4000500"` — which is why the bug surfaced one screen at
 * a time, always in a total, always as a figure that looked plausible.
 *
 * Fixing it at the edge rather than sprinkling `Number()` across the client
 * means the existing types become true instead of every future `+` being a new
 * chance to get it wrong.
 *
 * Precision is not at risk: a JS number is exact to 2^53, and these are
 * bolivares with two decimals.
 */
@Injectable()
export class DecimalInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((body) => convert(body)));
  }
}

function convert(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (Prisma.Decimal.isDecimal(value)) return value.toNumber();

  // Left alone on purpose: these serialise correctly already, and walking into
  // them would be pointless work on every response.
  if (value instanceof Date || Buffer.isBuffer(value)) return value;

  if (Array.isArray(value)) return value.map(convert);

  // Only plain objects. A class instance with getters would be rebuilt as a
  // bare object and lose whatever made it that class.
  if (typeof value === 'object' && isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = convert(item);
    }
    return result;
  }

  return value;
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
