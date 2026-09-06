import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Telegram's hard ceiling on `callback_data`. Bytes, not characters — an accent
 * in a breed name costs two.
 */
export const MAX_CALLBACK_BYTES = 64;

/** Lowercase, the only form Prisma's `uuid()` and Postgres ever produce. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** Marks a compressed uuid. The core never emits '~', so there is no ambiguity. */
const PACKED_MARKER = '~';
const PACKED = /~([A-Za-z0-9_-]{22})/g;

/** Marks a button whose id was too long to travel and had to be stored. */
const SURROGATE_MARKER = '!';

/**
 * Compresses every uuid in a button id.
 *
 * A uuid is 16 bytes written as 36 characters; base64url writes the same bytes
 * in 22. That matters because the ids the core builds are close to twice
 * Telegram's limit — `pyb:<uuid>:entry-<uuid>` is 83 bytes and would simply be
 * rejected — and because they carry the draft id, which is what makes a stale
 * tap a no-op instead of a misfire.
 *
 * Applied to the whole string rather than per segment, so the uuid inside
 * `entry-<uuid>` is caught too.
 */
export function packCallbackData(buttonId: string): string {
  return buttonId.replace(UUID, (uuid) => PACKED_MARKER + encodeUuid(uuid));
}

export function unpackCallbackData(data: string): string {
  return data.replace(PACKED, (whole, encoded: string) => decodeUuid(encoded) ?? whole);
}

export function callbackByteLength(data: string): number {
  return Buffer.byteLength(data, 'utf8');
}

/**
 * Turns button ids into `callback_data` and back.
 *
 * Almost everything fits once the uuids are compressed, and that path is
 * stateless. What does not fit is a free-text option id — a breed name is
 * whatever somebody typed — so those get an opaque token and are remembered
 * here. A token lost to a restart makes the button a no-op, which is exactly
 * how the assistant already treats a tap on something that has gone.
 */
@Injectable()
export class TelegramCallbackService {
  private readonly logger = new Logger(TelegramCallbackService.name);
  /** Insertion-ordered, so the oldest entry is the first key. */
  private readonly surrogates = new Map<string, string>();
  private static readonly MAX_SURROGATES = 1_000;

  encode(buttonId: string): string {
    const packed = packCallbackData(buttonId);
    if (callbackByteLength(packed) <= MAX_CALLBACK_BYTES) return packed;

    // Random rather than sequential: a counter restarts at zero, and a token
    // reissued after a restart would give an old button a new meaning.
    const token = SURROGATE_MARKER + randomBytes(9).toString('base64url');
    this.surrogates.set(token, buttonId);

    if (this.surrogates.size > TelegramCallbackService.MAX_SURROGATES) {
      const oldest = this.surrogates.keys().next().value;
      if (oldest) this.surrogates.delete(oldest);
    }

    this.logger.debug(`Button id too long for callback_data, stored as ${token}`);
    return token;
  }

  decode(data: string): string {
    if (!data.startsWith(SURROGATE_MARKER)) return unpackCallbackData(data);
    // An unknown token decodes to itself: the core parses it, finds no draft,
    // and says nothing — the same as any other stale tap.
    return this.surrogates.get(data) ?? data;
  }
}

function encodeUuid(uuid: string): string {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex').toString('base64url');
}

/** Returns null if this was not one of ours, so the text is left untouched. */
function decodeUuid(encoded: string): string | null {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(encoded, 'base64url');
  } catch {
    return null;
  }
  if (bytes.length !== 16) return null;
  // Re-encoding has to reproduce the input exactly; base64url decoding is
  // lenient about trailing bits, and a lookalike must not become a valid uuid.
  if (bytes.toString('base64url') !== encoded) return null;

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
