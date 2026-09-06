import type { ReceiptFields } from '../../receipt-ocr/patterns';
import type { ReaderTier } from '../../receipt-ocr/receipt-reader.service';

/** Everything a transport must hand the core. Adding a channel means producing this. */
export interface IncomingMessage {
  channel: string;
  /** The channel's own message id — the idempotency key. */
  externalId: string;
  /** Sender identity on that channel (E.164 without '+' for WhatsApp). */
  from: string;
  kind: 'image' | 'text' | 'button' | 'flow_reply';
  media?: { data: Buffer; mimeType: string };
  text?: string;
  buttonId?: string;
  /** A submitted form: the token we issued, plus whatever the user filled in. */
  flowReply?: { flowToken: string; submission: Record<string, unknown> };
}

export interface ReplyButton {
  id: string;
  title: string;
  /**
   * Second line shown under the title. Only a list can render it, so it must
   * never carry information the title needs — with three or fewer options
   * WhatsApp draws plain buttons and this is dropped.
   */
  description?: string;
}

/**
 * A native form to open in the chat.
 *
 * Everything it will display travels with it: in `navigate` mode there is no
 * server for the form to call back into, which is what makes it free to run and
 * possible without a public endpoint.
 */
export interface OutgoingFlow {
  /** Meta's id for the published form. */
  flowId: string;
  /** Our correlation id, echoed back inside the submission. */
  flowToken: string;
  screen: string;
  cta: string;
  header?: string;
  data: Record<string, unknown>;
  /** Send the unpublished version, for trying a form out before releasing it. */
  draft?: boolean;
}

/** Everything the core hands back. A transport only has to render this. */
export interface OutgoingMessage {
  text: string;
  buttons?: ReplyButton[];
  flow?: OutgoingFlow;
}

/** What the money did, from our side of the ledger. */
export type MoneyDirection =
  /** Money arrived in one of our accounts. */
  | 'in'
  /** Money left one of our accounts. */
  | 'out'
  /** Both sides are ours — a move between our own accounts. */
  | 'internal'
  /** Neither side matched an account we know. */
  | 'unknown';

export interface ResolvedDirection {
  direction: MoneyDirection;
  /** Our account on the side the money moved from/to. */
  ourAccountId: string | null;
  ourAccountName: string | null;
  /** For an internal move, the other side. */
  counterAccountId: string | null;
  counterAccountName: string | null;
}

export interface ResolvedReceipt {
  fields: ReceiptFields;
  direction: ResolvedDirection;
  tier: ReaderTier;
  /** Bolivares per USD used to show the equivalent, and whether it is today's. */
  exchangeRate: number | null;
  exchangeRateStale: boolean;
  warnings: string[];
  missing: string[];
  /** Set when this bank reference was already booked. */
  duplicateOf: { id: string; movementDate: Date; amount: string; accountName: string } | null;
}

export const DRAFT_INTENT = {
  RECEIPT_IN: 'receipt_in',
  RECEIPT_OUT: 'receipt_out',
  RECEIPT_INTERNAL: 'receipt_internal',
} as const;

/** Button id prefixes. The draft id travels inside the id so a stale tap is a no-op. */
export const BUTTON = {
  CONFIRM: 'cf',
  CANCEL: 'cx',
  ALTERNATIVE: 'alt',
  CATEGORY: 'cat',
  SALE_PAYMENT: 'pay',
  /** Pay a purchase or a processing: `pyb:<draftId>:<kind>-<payableId>`. */
  PAYABLE: 'pyb',
  /** Open the list of payables of one kind: `pyl:<draftId>:<kind>`. */
  PAYABLE_PICK: 'pyl',
  /** Open the plain expense categories: `ctl:<draftId>`. */
  CATEGORY_PICK: 'ctl',
  /** A main-menu operation: `mn:<operation>`. Carries no draft. */
  MENU: 'mn',
  /** Opens a WhatsApp form: `fm:<flowKind>`. Carries no draft either. */
  FORM: 'fm',
  /**
   * Confirms that a planned batch arrived: `bc:<batchId>` asks, `bc:<batchId>:ok`
   * does it. Two taps because the transition is one-way and books the expense.
   */
  BATCH_CONFIRM: 'bc',
  /** Lists the planned batches to confirm, when there is more than one: `bcl:all`. */
  BATCH_PICK: 'bcl',
  /** Answers a step-by-step question: `wz:<flowToken>:<value>`. */
  WIZARD: 'wz',
  /** Opens one client's pending sales, from Cobrar: `cs:<clientId>`. Carries no draft. */
  CLIENT_SALES: 'cs',
} as const;

export function buildButtonId(prefix: string, draftId: string, extra?: string): string {
  return extra ? `${prefix}:${draftId}:${extra}` : `${prefix}:${draftId}`;
}

export function parseButtonId(
  buttonId: string,
): { prefix: string; draftId: string; extra: string | null } | null {
  const parts = buttonId.split(':');
  if (parts.length < 2) return null;
  return { prefix: parts[0], draftId: parts[1], extra: parts[2] ?? null };
}
