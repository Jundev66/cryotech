import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DraftService } from './drafts/draft.service';
import { ReceiptQueueService } from './queue/receipt-queue.service';
import { ReceiptExecutorService, type ExecuteAction } from './executors/receipt-executor.service';
import { SummaryFormatter } from './formatting/summary.formatter';
import { todayIn } from './formatting/number.format';
import { MenuService } from './menu/menu.service';
import { isMenuOperation, TEXT_SHORTCUTS } from './menu/menu.catalog';
import { PayablesService } from '../payables/payables.service';
import { FlowService } from './flows/flow.service';
import { WizardService } from './wizard/wizard.service';
import { isFlowKind, isOperationKind, type OperationKind } from './flows/flow.catalog';
import { parseQuickEntry, type QuickEntry } from './quick-entry/quick-entry.parser';
import { DigestService } from './digest/digest.service';
import { ReceiptCompletionService } from './queue/receipt-completion.service';
import { BUTTON, buildButtonId, parseButtonId, type OutgoingMessage } from './types/assistant.types';
import type { PayableKind } from '../payables/payables.types';
import { ClientResolver } from './resolvers/client.resolver';

const DEFAULT_TIMEZONE = 'America/Caracas';

/**
 * How sure a typed name has to be to pick the client without asking.
 *
 * The same bar the receipt uses, plus a clear gap to the runner-up: "José"
 * with two Josés on the books narrows the list rather than choosing one.
 */
const CONFIDENT_CLIENT_MATCH = 0.85;
const CLIENT_MATCH_GAP = 0.15;

/**
 * Openers that should never read as "I did not understand" — they carry no
 * intent of their own, so the plain menu is the whole answer.
 */
const GREETINGS = new Set([
  'hola', 'holaa', 'ola', 'hey', 'hi', 'buenas',
  'buenos dias', 'buenas tardes', 'buenas noches',
  'menu', 'inicio', 'start',
]);

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly drafts: DraftService,
    private readonly queue: ReceiptQueueService,
    private readonly executor: ReceiptExecutorService,
    private readonly formatter: SummaryFormatter,
    private readonly payables: PayablesService,
    private readonly menu: MenuService,
    private readonly flows: FlowService,
    private readonly wizard: WizardService,
    private readonly clientResolver: ClientResolver,
    private readonly configService: ConfigService,
    private readonly digest: DigestService,
    private readonly completion: ReceiptCompletionService,
  ) {}

  /** Handles a submitted WhatsApp form. */
  async handleFlowReply(
    flowToken: string,
    submission: Record<string, unknown>,
  ): Promise<OutgoingMessage | null> {
    return this.flows.handleSubmission(flowToken, submission);
  }

  /** Lists what is still waiting, for the `pendientes` shortcut. */
  async showPending(channel: string, externalUserId: string): Promise<OutgoingMessage> {
    const next = await this.queue.presentNext(channel, externalUserId);
    return next ?? { text: 'No tienes comprobantes pendientes por clasificar.' };
  }

  /**
   * Handles anything the user typed.
   *
   * An operation in progress gets first claim: mid-wizard, "25" is the answer
   * to a question, not a request for the menu. Otherwise a recognised word
   * opens its operation and everything else opens the menu — there is no "I did
   * not understand", because an unrecognised message is a user who does not
   * know what to ask for, and a menu answers that better than an apology.
   */
  async handleText(
    text: string,
    companyId: string,
    channel: string,
    externalUserId: string,
  ): Promise<OutgoingMessage> {
    const normalized = text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .toLowerCase();

    const active = await this.wizard.findActive(channel, externalUserId);
    if (active) {
      // The one word that always gets you out, whatever is half-answered.
      if (normalized === 'cancelar' || normalized === 'salir') {
        return (await this.wizard.answerButton(active.flowToken, '__cancel')) ?? { text: 'Listo.' };
      }
      return this.wizard.answerText(active, text);
    }

    // A receipt on screen asking for its amount or reference. Only a message
    // that looks like the answer is taken as one; anything else falls through.
    const completed = await this.completion.answerText(companyId, channel, externalUserId, text);
    if (completed) return completed;

    // Asked for by name: the summaries that also arrive on their own, and the rate.
    if (normalized === 'resumen' || normalized === 'resumen de hoy' || normalized === 'hoy') {
      return this.digest.daily(companyId);
    }
    if (normalized === 'semana' || normalized === 'resumen semanal') {
      return this.digest.weekly(companyId);
    }
    if (normalized === 'tasa' || normalized === 'bcv' || normalized === 'dolar') {
      return this.digest.rate(companyId);
    }

    // A one-line operation — "gasté 20$ gasoil", "cobré 100$ juan" — opens its
    // wizard with whatever could be read already answered. It goes before the
    // client search, which would otherwise take "juan pagó 50" for a name.
    const quick = parseQuickEntry(text, todayIn(this.timeZone()));
    if (quick) return this.openQuickEntry(quick, companyId, channel, externalUserId);

    const shortcut = TEXT_SHORTCUTS[normalized];
    if (shortcut) return this.menu.handle(shortcut, companyId, channel, externalUserId);

    // Nothing recognised yet: a name that matches a real client outranks the
    // menu, since that is what "Cobrar" trains people to type. Anywhere else in
    // the chat it is still a fair guess — the client list has no notion of
    // "current screen" to gate this on.
    let clientCandidate = text.trim();
    const clientQueryMatch = text.match(
      /^(?:cobrar(?:le)?(?:\s+(?:el\s+pollo|los\s+pollos))?(?:\s+a|\s+de)?|cuenta(?:\s+de)?|saldo(?:\s+de)?|deuda(?:\s+de)?|ventas?(?:\s+de|\s+a)?)\s+(.+)$/i,
    );
    if (clientQueryMatch && clientQueryMatch[1]) {
      clientCandidate = clientQueryMatch[1].trim();
    }

    let matches = await this.clientResolver.searchByName(companyId, clientCandidate);
    if (matches.length === 0 && clientCandidate !== text.trim()) {
      matches = await this.clientResolver.searchByName(companyId, text.trim());
    }

    if (matches.length === 1) return this.menu.clientSales(companyId, matches[0].id);
    if (matches.length > 1) {
      return {
        text: `Encontré varios con "${clientCandidate}" — ¿cuál?`,
        buttons: matches.map((match) => ({
          id: buildButtonId(BUTTON.CLIENT_SALES, match.id),
          title: `👤 ${match.name}`,
        })),
      };
    }

    const menu = await this.menu.main(companyId, channel, externalUserId);
    if (GREETINGS.has(normalized) || normalized === '') return menu;
    return { ...menu, text: `No entendí "${text.trim()}" 🤔\n\n${menu.text}` };
  }

  /**
   * Handles a tapped button.
   *
   * Returns null — meaning "say nothing" — when the draft is gone. Tapping a
   * button from a receipt that was already registered, cancelled or expired is
   * a normal thing for a user to do, and answering it would both confuse and
   * cost an outbound message.
   */
  async handleButton(
    buttonId: string,
    companyId: string,
    channel: string,
    externalUserId: string,
  ): Promise<OutgoingMessage | null> {
    const parsed = parseButtonId(buttonId);
    if (!parsed) return null;

    // A menu row carries an operation where a draft id would be — it opens a
    // screen rather than acting on a receipt.
    if (parsed.prefix === BUTTON.MENU) {
      if (!isMenuOperation(parsed.draftId)) return null;
      return this.menu.handle(parsed.draftId, companyId, channel, externalUserId);
    }

    if (parsed.prefix === BUTTON.FORM) {
      if (!isOperationKind(parsed.draftId)) return null;
      // `fm:collect:<clientId>` or `fm:sale:<clientId>` opens the operation already on that client.
      const prefill: Record<string, string> =
        (parsed.draftId === 'collect' || parsed.draftId === 'sale') && parsed.extra
          ? { client: parsed.extra }
          : {};
      return this.openOperation(companyId, parsed.draftId, channel, externalUserId, prefill);
    }

    if (parsed.prefix === BUTTON.WIZARD) {
      return this.wizard.answerButton(parsed.draftId, parsed.extra ?? '');
    }

    if (parsed.prefix === BUTTON.UNDO) {
      return this.wizard.undo(companyId, parsed.draftId);
    }

    if (parsed.prefix === BUTTON.BATCH_PICK) {
      return this.menu.plannedBatchPicker(companyId);
    }

    if (parsed.prefix === BUTTON.CLIENT_SALES) {
      return this.menu.clientSales(companyId, parsed.draftId);
    }

    // Two taps: the first reads back what confirming is about to write, the
    // second writes it. The transition is one-way and books the expense.
    if (parsed.prefix === BUTTON.BATCH_CONFIRM) {
      const done =
        parsed.extra === 'ok'
          ? await this.menu.confirmBatch(companyId, parsed.draftId)
          : await this.menu.confirmBatchPrompt(companyId, parsed.draftId);
      if (!done) return null;
      // Only after it is registered: appending "here's the next receipt" to the
      // question would answer it for the user.
      return parsed.extra === 'ok' ? this.withNext({ channel, externalUserId }, done) : done;
    }

    if (parsed.prefix === BUTTON.CANCEL) {
      const target = await this.drafts.findById(companyId, parsed.draftId);
      const cancelled = await this.drafts.cancel(companyId, parsed.draftId);
      if (!cancelled) return null;
      return this.withNext(target, { text: 'Listo, lo descarté. No registré nada.' });
    }

    // Drilling into a sub-list only re-renders; the draft stays pending so the
    // user can still back out or pick something else.
    if (parsed.prefix === BUTTON.PAYABLE_PICK) {
      return this.showPayablePicker(companyId, parsed.draftId, parsed.extra);
    }
    if (parsed.prefix === BUTTON.CATEGORY_PICK) {
      const draft = await this.drafts.findById(companyId, parsed.draftId);
      if (!draft || draft.status !== 'pending') return null;
      return this.formatter.categoryPicker(parsed.draftId);
    }

    // A field the reader could not see, answered with a tap.
    if (parsed.prefix === BUTTON.RECEIPT_FIELD) {
      return this.completion.answerButton(companyId, parsed.draftId, parsed.extra ?? '');
    }

    // "Cobro de venta" on a receipt whose payer is not certain: ask who first.
    if (parsed.prefix === BUTTON.CLIENT_PICK) {
      return this.completion.clientChoices(companyId, parsed.draftId);
    }

    // A client picked from that list travels in the button.
    const action: ExecuteAction | null =
      parsed.prefix === BUTTON.SALE_PAYMENT && parsed.extra
        ? { kind: 'sale_payment', clientId: parsed.extra }
        : this.toAction(parsed.prefix, parsed.extra);
    if (!action) return null;

    // Atomic pending -> confirmed. A second tap finds nothing to claim, which
    // is what stops a double tap from registering the payment twice.
    const draft = await this.drafts.claim(companyId, parsed.draftId);
    if (!draft) return null;

    try {
      const reply = await this.executor.execute(draft, action);
      await this.drafts.markExecuted(draft.id, action.kind, draft.id);
      return this.withNext(draft, reply);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Draft ${draft.id} failed to execute: ${message}`);
      // Back to pending so the user can fix the cause and tap again, rather
      // than having to resend the screenshot.
      await this.drafts.markFailed(draft.id, message);
      return { text: `⚠️ No pude registrarlo: ${message}` };
    }
  }

  /**
   * Opens an operation the best way available.
   *
   * A published WhatsApp form when there is one — a single screen with a real
   * calendar — and the step-by-step wizard otherwise. Today it is always the
   * wizard: Meta will not release forms from an unregistered business. The
   * choice lives here so that stops being true without anything else changing.
   */
  async openOperation(
    companyId: string,
    kind: OperationKind,
    channel: string,
    externalUserId: string,
    prefill: Record<string, string> = {},
  ): Promise<OutgoingMessage> {
    if (isFlowKind(kind) && this.flows.isAvailable(kind)) {
      return this.flows.open(companyId, kind, channel, externalUserId);
    }
    return this.wizard.start(companyId, kind, channel, externalUserId, prefill);
  }

  /**
   * Opens the wizard a typed sentence asked for, with what it said filled in.
   *
   * A client name is only pinned when it clearly means one person. Otherwise it
   * narrows the list, and the tap stays with the user: "José" with two Josés on
   * the books must never charge the wrong one.
   */
  private async openQuickEntry(
    entry: QuickEntry,
    companyId: string,
    channel: string,
    externalUserId: string,
  ): Promise<OutgoingMessage> {
    if (entry.kind === 'entry') {
      const reply = await this.openOperation(companyId, 'entry', channel, externalUserId);
      return {
        ...reply,
        text: `_El alimento y los pollitos se registran como compra, así entran al inventario._\n\n${reply.text}`,
      };
    }

    const prefill: Record<string, string> = { ...entry.seed };

    if ((entry.kind === 'collect' || entry.kind === 'sale') && entry.clientName) {
      const [best, runnerUp] = await this.clientResolver.searchByName(companyId, entry.clientName);
      const clear =
        best &&
        best.score >= CONFIDENT_CLIENT_MATCH &&
        (!runnerUp || best.score - runnerUp.score >= CLIENT_MATCH_GAP);
      if (clear) prefill.client = best.id;
      else prefill.__filter = entry.clientName;
    }

    return this.wizard.start(companyId, entry.kind, channel, externalUserId, prefill);
  }

  private timeZone(): string {
    return this.configService.get<string>('ASSISTANT_TIMEZONE') ?? DEFAULT_TIMEZONE;
  }

  private async showPayablePicker(
    companyId: string,
    draftId: string,
    kind: string | null,
  ): Promise<OutgoingMessage | null> {
    if (kind !== 'entry' && kind !== 'processing') return null;

    const draft = await this.drafts.findById(companyId, draftId);
    if (!draft || draft.status !== 'pending') return null;

    const open = await this.payables.listOpen(draft.companyId, { kind });
    return this.formatter.payablePicker(draftId, kind, open);
  }

  /**
   * Appends the next queued receipt to an acknowledgement.
   *
   * One message carries both "done" and "here's the next one", so working
   * through a batch of five costs five messages instead of ten — and reads as
   * a single continuous flow instead of a stream of confirmations.
   */
  private async withNext(
    draft: { channel: string; externalUserId: string } | null,
    reply: OutgoingMessage,
  ): Promise<OutgoingMessage> {
    if (!draft) return reply;

    const next = await this.queue.presentNext(draft.channel, draft.externalUserId);
    if (!next) return reply;

    return {
      text: `${reply.text}\n\n${next.text}`,
      buttons: next.buttons,
    };
  }

  private toAction(prefix: string, extra: string | null): ExecuteAction | null {
    if (prefix === BUTTON.SALE_PAYMENT) return { kind: 'sale_payment' };
    if (prefix === BUTTON.CATEGORY && extra) return { kind: 'category', category: extra };
    if (prefix === BUTTON.CONFIRM) return { kind: 'transfer' };
    if (prefix === BUTTON.PAYABLE && extra) {
      const payable = parsePayableRef(extra);
      if (payable) return { kind: 'payable_payment', ...payable };
    }
    return null;
  }
}

/** `entry-<uuid>` / `processing-<uuid>`, the form that fits in a button id. */
function parsePayableRef(extra: string): { payableKind: PayableKind; payableId: string } | null {
  const separator = extra.indexOf('-');
  if (separator < 0) return null;

  const kind = extra.slice(0, separator);
  const id = extra.slice(separator + 1);
  if (kind !== 'entry' && kind !== 'processing') return null;
  if (!id) return null;

  return { payableKind: kind, payableId: id };
}
