import { Injectable, Logger } from '@nestjs/common';
import { DraftService } from './drafts/draft.service';
import { ReceiptQueueService } from './queue/receipt-queue.service';
import { ReceiptExecutorService, type ExecuteAction } from './executors/receipt-executor.service';
import { SummaryFormatter } from './formatting/summary.formatter';
import { MenuService } from './menu/menu.service';
import { isMenuOperation, TEXT_SHORTCUTS } from './menu/menu.catalog';
import { PayablesService } from '../payables/payables.service';
import { FlowService } from './flows/flow.service';
import { WizardService } from './wizard/wizard.service';
import { isFlowKind, type FlowKind } from './flows/flow.catalog';
import { BUTTON, buildButtonId, parseButtonId, type OutgoingMessage } from './types/assistant.types';
import type { PayableKind } from '../payables/payables.types';
import { ClientResolver } from './resolvers/client.resolver';

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

    const shortcut = TEXT_SHORTCUTS[normalized];
    if (shortcut) return this.menu.handle(shortcut, companyId, channel, externalUserId);

    // Nothing recognised yet: a name that matches a real client outranks the
    // menu, since that is what "Cobrar" trains people to type. Anywhere else in
    // the chat it is still a fair guess — the client list has no notion of
    // "current screen" to gate this on.
    const matches = await this.clientResolver.searchByName(companyId, text);
    if (matches.length === 1) return this.menu.clientSales(companyId, matches[0].id);
    if (matches.length > 1) {
      return {
        text: `Encontré varios con "${text.trim()}" — ¿cuál?`,
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
      if (!isFlowKind(parsed.draftId)) return null;
      return this.openOperation(companyId, parsed.draftId, channel, externalUserId);
    }

    if (parsed.prefix === BUTTON.WIZARD) {
      return this.wizard.answerButton(parsed.draftId, parsed.extra ?? '');
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

    const action = this.toAction(parsed.prefix, parsed.extra);
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
    kind: FlowKind,
    channel: string,
    externalUserId: string,
  ): Promise<OutgoingMessage> {
    if (this.flows.isAvailable(kind)) {
      return this.flows.open(companyId, kind, channel, externalUserId);
    }
    return this.wizard.start(companyId, kind, channel, externalUserId);
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
