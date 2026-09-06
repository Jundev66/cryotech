import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type BotFlowSession } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { FlowDataService } from '../flows/flow-data.service';
import { FlowSubmissionService } from '../flows/flow-submission.service';
import { FlowSessionService } from '../flows/flow-session.service';
import { formatBs, parseLocalNumber, todayIn } from '../formatting/number.format';
import { normalize, rankByName } from '../../../common/search/fuzzy.util';
import { BUTTON, buildButtonId, type OutgoingMessage, type ReplyButton } from '../types/assistant.types';
import { CALENDAR_PAST_DAYS, type FlowKind } from '../flows/flow.catalog';
import { WIZARDS, visibleSteps, type WizardStep } from './wizard.catalog';

const DEFAULT_TIMEZONE = 'America/Caracas';
/** Reserved answers, prefixed so they can never collide with a real id. */
const CANCEL = '__cancel';
const SKIP = '__skip';
const CONFIRM = '__confirm';
const NEXT_PAGE = '__page';
const ADD_MORE = '__add';
const SEARCH = '__search';
const RUN = '__run';
/** Whether this sale is part of a run. Reserved, like the page and the filter. */
const RUN_KEY = '__run';
/** Where the current page is parked. Reserved, so it can never be a step key. */
const PAGE_KEY = '__page';
/** What was typed to narrow a long list. Reserved for the same reason. */
const FILTER_KEY = '__filter';
/**
 * How close a name has to be when nothing contains what was typed.
 *
 * Only reached after the substring pass finds nothing, so this is the tolerance
 * for a typo — "gonzales" for "González" — not for a prefix.
 */
const FUZZY_MATCH = 0.45;
/** WhatsApp's ceiling for an interactive list. */
const MAX_ROWS = 10;
/**
 * Options that fit on a page once the fixed rows are subtracted.
 *
 * "Cancelar" and "Ver más" always take one each, and the action rows on top —
 * search, several clients — take the rest. Getting this wrong does not wrap the
 * list, it makes Meta reject the whole message for having eleven rows.
 */
function pageSizeWith(actionCount: number): number {
  return Math.max(1, MAX_ROWS - 2 - actionCount);
}

interface Option {
  id: string;
  title: string;
  description?: string;
}

type Row = Record<string, string>;

/**
 * Operations where one run produces several rows.
 *
 * A sale run and a batch's supplies are the same shape: some answers are common
 * to the whole thing (the batch, the price, the date — the warehouse, the breed) and
 * a handful repeat. Parking the repeating ones and asking them again is what
 * makes the second row cost three questions instead of all of them.
 *
 * Nothing is written until the end, so the whole run lands in one transaction.
 */
interface Repeatable {
  /** The answers that change from one row to the next. */
  keys: readonly string[];
  /** Where the parked rows live inside the session context. */
  bucket: string;
  addLabel: string;
  /** Whether repeating applies at all, given what has been answered. */
  enabled?: (answers: Record<string, string>) => boolean;
  /** How a parked row reads back before it is registered. */
  describe: (row: Row, title: (optionsKey: string, id: string) => string) => string;
  parkedNote: (count: number) => string;
  confirmLabel: (count: number) => string;
  question: (count: number) => string;
}

const REPEATABLE: Partial<Record<FlowKind, Repeatable>> = {
  sale: {
    keys: ['client', 'quantity', 'weight_kg'],
    bucket: 'cart',
    addLabel: '➕ Otro cliente',
    describe: (row, title) =>
      `${title('clients', row.client)}: ${row.quantity} aves · ${row.weight_kg} kg`,
    parkedNote: (count) => `Van ${count} en esta tanda.`,
    confirmLabel: (count) => (count > 1 ? `✅ Registrar ${count}` : '✅ Registrar'),
    question: (count) => (count > 1 ? `¿Registro las ${count} ventas?` : '¿Lo registro así?'),
  },
  batch_plan: {
    keys: ['supply_product', 'supply_quantity', 'supply_cost', 'supply_delivery'],
    bucket: 'supplies',
    addLabel: '➕ Agregar otro insumo',
    enabled: (answers) => answers.add_supplies === 'yes',
    // The multiplied total: that is the figure the user can check against the
    // invoice. The unit price they can only check against memory.
    describe: (row, title) =>
      `${title('products', row.supply_product)}: ${formatQuantity(Number(row.supply_quantity))} × ${formatBs(
        Number(row.supply_cost),
      )} = ${formatBs(round2(Number(row.supply_quantity) * Number(row.supply_cost)))}`,
    parkedNote: (count) => `Van ${count} insumo${count === 1 ? '' : 's'}.`,
    confirmLabel: () => '✅ Planificar lote',
    question: (count) =>
      count > 1 ? `¿Planifico el lote con esos ${count} insumos?` : '¿Lo registro así?',
  },
};

function pickRow(keys: readonly string[], answers: Record<string, string>): Row {
  const row: Row = {};
  for (const key of keys) row[key] = answers[key] ?? '';
  return row;
}

/**
 * Asks for an operation one question at a time, with buttons.
 *
 * This is the working substitute for WhatsApp's native forms, which Meta will
 * not release from an unregistered business. It asks the same questions and
 * ends in the same records — `FlowSubmissionService` executes both — but as a
 * conversation instead of a single screen.
 *
 * What is lost: a real calendar, and one message per question instead of one
 * for the whole form. What is not lost: everything that can be tapped still is.
 * Only quantities are typed, and those had to be typed in the form too.
 */
@Injectable()
export class WizardService {
  private readonly logger = new Logger(WizardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly data: FlowDataService,
    private readonly submissions: FlowSubmissionService,
    private readonly sessions: FlowSessionService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Opens an operation and asks its first question.
   *
   * Anything half-answered is dropped first: two live wizards would compete for
   * the next thing the user types, and the older one is the one they walked
   * away from.
   */
  async start(
    companyId: string,
    kind: FlowKind,
    channel: string,
    externalUserId: string,
  ): Promise<OutgoingMessage> {
    const payload = await this.data.build(companyId, kind);
    if (payload.blocked) return { text: payload.blocked };

    await this.prisma.botFlowSession.updateMany({
      where: { channel, externalUserId, status: 'pending' },
      data: { status: 'abandoned' },
    });

    // A question whose answer is already known is not asked: the wizard always
    // walks to the first key nobody has answered, so seeding one skips it.
    const seeded = payload.seedAnswers ?? {};

    const steps = visibleSteps(kind, seeded);
    const answered = new Set(Object.keys(seeded));
    const found = steps.findIndex((step) => !answered.has(step.key));
    const first = found < 0 ? steps.length : found;

    const session = await this.sessions.open({
      companyId,
      channel,
      externalUserId,
      flowKind: kind,
      context: payload.context as never,
      answers: seeded,
      step: first,
    });

    return this.render(session, seeded, first, `*${WIZARDS[kind].title}*`);
  }

  /** The operation this user is in the middle of, if any. */
  async findActive(channel: string, externalUserId: string): Promise<BotFlowSession | null> {
    return this.prisma.botFlowSession.findFirst({
      where: { channel, externalUserId, status: 'pending', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** A tapped option. The token travels in the button id, so a stale tap is a no-op. */
  async answerButton(flowToken: string, value: string): Promise<OutgoingMessage | null> {
    const session = await this.prisma.botFlowSession.findUnique({ where: { flowToken } });
    if (!session || session.status !== 'pending') return null;
    if (session.expiresAt <= new Date()) {
      return { text: 'Eso ya venció. Escribe cualquier cosa para volver al menú.' };
    }
    return this.apply(session, value, true);
  }

  /** Something typed, when a question is waiting for a number or a name. */
  async answerText(session: BotFlowSession, text: string): Promise<OutgoingMessage> {
    return (await this.apply(session, text.trim(), false)) ?? { text: 'No pude registrarlo.' };
  }

  private async apply(
    session: BotFlowSession,
    raw: string,
    fromButton: boolean,
  ): Promise<OutgoingMessage | null> {
    const kind = session.flowKind as FlowKind;
    const answers = (session.answers ?? {}) as Record<string, string>;

    if (raw === CANCEL) {
      await this.prisma.botFlowSession.update({
        where: { id: session.id },
        data: { status: 'cancelled' },
      });
      return { text: 'Listo, lo dejé así. No registré nada.' };
    }

    const steps = visibleSteps(kind, answers);

    // Both are answered from the confirmation screen, where `session.step` has
    // already run past the last question — so they have to be handled before
    // the lookup below gives up and re-renders that same screen.
    if (raw === CONFIRM) return this.execute(session, answers);
    if (raw === ADD_MORE) return this.parkRow(session, answers);

    const step = steps[session.step];
    if (!step) return this.confirmation(session, answers);

    // Just a prompt: typing already worked, but an italic line under the
    // question is lost when WhatsApp hides the list behind "Elegir".
    if (raw === SEARCH) {
      return this.render(session, answers, session.step, '🔎 Escríbeme el nombre, o parte de él.');
    }

    // Turns the batch on from the first question instead of it being found at
    // the end. Nothing else changes: the first sale is answered in full.
    if (raw === RUN) {
      const next = { ...answers, [RUN_KEY]: '1' };
      const updated = await this.prisma.botFlowSession.update({
        where: { id: session.id },
        data: { answers: next as Prisma.InputJsonValue },
      });
      return this.render(
        updated,
        next,
        session.step,
        'Voy a ir sumando clientes. Empecemos por el primero.',
      );
    }

    if (raw === NEXT_PAGE) {
      // Counted over what is on screen, not over everything: after typing a
      // name, "Ver más" has to page through the matches, not the whole list.
      const shown = this.shownOptions(session, step, answers);
      const size = pageSizeWith(this.actionRows(session, step, answers, shown).length);
      const pages = Math.ceil((shown?.length ?? 0) / size);
      const page = (Number(answers[PAGE_KEY] ?? 0) + 1) % Math.max(pages, 1);
      const updated = await this.prisma.botFlowSession.update({
        where: { id: session.id },
        data: { answers: { ...answers, [PAGE_KEY]: String(page) } as Prisma.InputJsonValue },
      });
      return this.render(updated, { ...answers, [PAGE_KEY]: String(page) }, session.step, '');
    }

    if (raw === SKIP) {
      if (!step.optional) return this.render(session, answers, session.step, '');
      return this.advance(session, answers, step.key, '');
    }

    const validated = await this.validate(session, step, raw, fromButton, answers);
    if ('error' in validated) {
      return this.render(session, answers, session.step, `⚠️ ${validated.error}`);
    }

    // Typed into a long list: it narrows the list rather than answering it. The
    // choice itself is still a tap — see `validate`.
    if ('filter' in validated) {
      const next = { ...answers, [FILTER_KEY]: validated.filter, [PAGE_KEY]: '0' };
      const updated = await this.prisma.botFlowSession.update({
        where: { id: session.id },
        data: { answers: next as Prisma.InputJsonValue },
      });
      return this.render(updated, next, session.step, '');
    }

    return this.advance(session, answers, step.key, validated.value);
  }

  private async validate(
    session: BotFlowSession,
    step: WizardStep,
    raw: string,
    fromButton: boolean,
    answers: Record<string, string>,
  ): Promise<{ value: string } | { error: string } | { filter: string }> {
    if (step.kind === 'choice' || step.kind === 'date') {
      if (!fromButton) {
        // A data-driven list can run to dozens of rows, and paging to the Z's
        // costs a tap per page every single time. Typing narrows it instead.
        //
        // Not for the other two: a fixed list is three rows you can already see,
        // and a typed date is a parsing problem, not a filtering one.
        if (step.kind === 'choice' && step.optionsKey) return { filter: raw };
        return { error: 'Toca una de las opciones de abajo.' };
      }

      // A tapped id still has to be one we offered: the list may have been sent
      // days ago, and by now the client could be gone or the date out of range.
      const options = this.choicesFor(session, step, answers) ?? [];
      if (!options.some((option) => option.id === raw)) {
        return {
          error:
            step.kind === 'date'
              ? 'Esa fecha quedó fuera de rango. Elige una de la lista.'
              : 'Esa opción ya no está disponible.',
        };
      }
      return { value: raw };
    }

    if (step.kind === 'number') {
      const value = parseLocalNumber(raw);
      if (value === null) return { error: `No entendí "${raw}". Escribe solo el número.` };
      if (value < 0) return { error: 'No puede ser negativo.' };
      return { value: String(value) };
    }

    const text = raw.trim();
    if (text === '') return { error: 'Escribe algo, o toca Omitir.' };
    return { value: text };
  }

  private async advance(
    session: BotFlowSession,
    answers: Record<string, string>,
    key: string,
    value: string,
  ): Promise<OutgoingMessage> {
    // The page and the search text belong to the question that was just
    // answered. Carrying them over would open the next list on page three,
    // filtered by a name that means nothing to it.
    const next = { ...answers, [key]: value, [PAGE_KEY]: '0', [FILTER_KEY]: '' };
    const kind = session.flowKind as FlowKind;

    // Recomputed against the new answers: answering "yo mismo" on a processing
    // removes the two questions about who to pay and how much.
    const steps = visibleSteps(kind, next);
    const answered = new Set(Object.keys(next));
    const index = steps.findIndex((step) => !answered.has(step.key));

    const updated = await this.prisma.botFlowSession.update({
      where: { id: session.id },
      data: { answers: next as Prisma.InputJsonValue, step: index < 0 ? steps.length : index },
    });

    // With the batch on there is no intermediate confirmation: the sale is
    // parked and the next client asked for. It closes from the "✅ Registrar N"
    // row of that same question.
    if (index < 0 && next[RUN_KEY] === '1') return this.parkRow(updated, next);

    if (index < 0) return this.confirmation(updated, next);
    return this.render(updated, next, index, '');
  }

  /** Renders the question at `index`, optionally prefixed by a note. */
  private render(
    session: BotFlowSession,
    answers: Record<string, string>,
    index: number,
    note: string,
  ): OutgoingMessage {
    const kind = session.flowKind as FlowKind;
    const steps = visibleSteps(kind, answers);
    const step = steps[index];
    if (!step) return this.confirmation(session, answers);

    const all = this.choicesFor(session, step, answers);
    const filter = (answers[FILTER_KEY] ?? '').trim();
    const matched = all && filter ? this.filterOptions(all, filter) : all;

    // Nothing matched what was typed, so the whole list comes back: a list with
    // only "Cancelar" would trap the user over a typo.
    const missed = Boolean(all && filter && matched && matched.length === 0);
    const options = missed ? all : matched;

    // A choice question with nothing to choose is a dead end. It stops here,
    // saying what happened, instead of leaving the user boxed in.
    if (options && options.length === 0) {
      return {
        text:
          `${step.question}\n\n` +
          `No hay opciones disponibles ahora mismo, así que no puedo seguir con esto.\n` +
          `Escribe cualquier cosa para volver al menú.`,
      };
    }

    const lines: string[] = [];
    if (note) lines.push(note, '');
    lines.push(`${step.question}  _(${index + 1} de ${steps.length})_`);
    if (step.hint) lines.push(`_${step.hint}_`);

    if (missed) {
      lines.push(`_No encontré nada con "${filter}". Te muestro todos._`);
    } else if (filter && all && matched && matched.length < all.length) {
      lines.push(`_${matched.length} de ${all.length} con "${filter}" · escribe otra cosa para cambiar_`);
    } else if (this.isSearchable(step, all)) {
      lines.push('_Escribe un nombre para buscar, o toca de la lista_');
    }

    const buttons: ReplyButton[] = [];

    if (options) {
      buttons.push(
        ...this.paginate(
          session,
          step,
          options,
          Number(answers[PAGE_KEY] ?? 0),
          this.actionRows(session, step, answers, options),
        ),
      );
    } else if (step.optional) {
      buttons.push({
        id: buildButtonId(BUTTON.WIZARD, session.flowToken, SKIP),
        title: '⏭️ Omitir',
      });
    }

    buttons.push({
      id: buildButtonId(BUTTON.WIZARD, session.flowToken, CANCEL),
      title: '✖️ Cancelar',
    });

    return { text: lines.join('\n'), buttons };
  }

  /** Everything answered, laid out to read before it is written down. */
  private confirmation(session: BotFlowSession, answers: Record<string, string>): OutgoingMessage {
    const kind = session.flowKind as FlowKind;
    const repeat = REPEATABLE[kind];
    const repeating = Boolean(repeat && (repeat.enabled?.(answers) ?? true));
    const parked = repeating ? this.rowsOf(session) : [];
    const lines = [`*${WIZARDS[kind].title}*`, ''];

    // With a run going, the rows already parked come first — the last one alone
    // would read as the only one about to be registered.
    if (repeat && parked.length > 0) {
      const title = (optionsKey: string, id: string) => this.titleOf(session, optionsKey, id);
      for (const row of [...parked, pickRow(repeat.keys, answers)]) {
        lines.push(`▸ ${repeat.describe(row, title)}`);
      }
      lines.push('');
    }

    for (const step of visibleSteps(kind, answers)) {
      if (repeat && parked.length > 0 && repeat.keys.includes(step.key)) continue;
      const raw = answers[step.key];
      if (raw === undefined || raw === '') continue;
      lines.push(`▸ ${step.question.replace(/^¿|\?$/g, '')}: *${this.describe(session, step, raw, answers)}*`);
    }

    const total = parked.length + 1;
    lines.push('', repeat ? repeat.question(total) : '¿Lo registro así?');

    const buttons: ReplyButton[] = [
      {
        id: buildButtonId(BUTTON.WIZARD, session.flowToken, CONFIRM),
        title: repeat ? repeat.confirmLabel(total) : '✅ Registrar',
      },
    ];

    // Offered only where a second row means something. A daily log or a
    // slaughter is one per batch per day, and "another" there would only be a
    // way to duplicate it.
    if (repeat && repeating) {
      buttons.push({
        id: buildButtonId(BUTTON.WIZARD, session.flowToken, ADD_MORE),
        title: repeat.addLabel,
      });
    }

    buttons.push({ id: buildButtonId(BUTTON.WIZARD, session.flowToken, CANCEL), title: '✖️ Cancelar' });

    return { text: lines.join('\n'), buttons };
  }

  /** A parked row keeps ids; this is how one reads back as a name. */
  private titleOf(session: BotFlowSession, optionsKey: string, id: string): string {
    const context = (session.context ?? {}) as Record<string, unknown>;
    const options = context[optionsKey];
    if (!Array.isArray(options)) return id;
    return (options as Option[]).find((option) => option.id === id)?.title ?? id;
  }

  private async execute(
    session: BotFlowSession,
    answers: Record<string, string>,
  ): Promise<OutgoingMessage> {
    // Claim first: a double tap on "Registrar" finds nothing to claim and so
    // cannot register the same operation twice.
    const claimed = await this.sessions.claim(session.flowToken);
    if (!claimed) return { text: 'Eso ya lo registré.' };

    try {
      const result = await this.submissions.execute(claimed, answers);
      await this.sessions.markExecuted(claimed.id, result.resultType, result.resultId);
      return result.reply;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Wizard ${session.flowKind} failed: ${message}`);
      // Back to pending on the confirmation step, so the answers survive and
      // the user can fix the cause and tap again.
      await this.sessions.markFailed(claimed.id, message);

      // With the buttons, not just the instruction to use them: the message
      // said "toca Registrar otra vez" while sending nothing to tap, which
      // leaves the run stranded with its answers intact and no way back in.
      const back = this.confirmation(claimed, answers);
      return { ...back, text: `⚠️ No pude registrarlo: ${message}\n\n${back.text}` };
    }
  }

  /**
   * Narrows a list by what was typed.
   *
   * Substring first, over the accent-stripped title, because that is what a
   * half-typed name is: "merce" is not *similar* to "Mercedes", it is *inside*
   * it, and a similarity score would rank it below shorter names. Bigram
   * scoring only runs when nothing contains the text, which is the typo case.
   */
  private filterOptions(options: Option[], filter: string): Option[] {
    const query = normalize(filter);
    if (query === '') return options;

    const contained = options.filter((option) => normalize(option.title).includes(query));
    if (contained.length > 0) return contained;

    return rankByName(filter, options, (option) => option.title)
      .filter((scored) => scored.score >= FUZZY_MATCH)
      .map((scored) => scored.item);
  }

  /** A list long enough and data-driven enough to be worth typing at. */
  private isSearchable(step: WizardStep, options: Option[] | null): boolean {
    return step.kind === 'choice' && Boolean(step.optionsKey) && (options?.length ?? 0) > MAX_ROWS - 1;
  }

  /** What the current page is drawn from — the matches, when a search is on. */
  private shownOptions(
    session: BotFlowSession,
    step: WizardStep,
    answers: Record<string, string>,
  ): Option[] | null {
    const all = this.choicesFor(session, step, answers);
    const filter = (answers[FILTER_KEY] ?? '').trim();
    if (!all || !filter) return all;

    const matched = this.filterOptions(all, filter);
    return matched.length > 0 ? matched : all;
  }

  /**
   * Parks the row on screen and asks for the next one.
   *
   * What the run has in common stays put — the batch, the price, the date on a
   * sale; the warehouse, the breed, the date on a batch plan — so each extra row
   * costs only the questions that actually change. Nothing is written yet: the
   * whole run is registered at the end, in one transaction, so a batch cannot
   * be oversold between rows.
   */
  private async parkRow(
    session: BotFlowSession,
    answers: Record<string, string>,
  ): Promise<OutgoingMessage> {
    const kind = session.flowKind as FlowKind;
    const repeat = REPEATABLE[kind];
    if (!repeat) return this.confirmation(session, answers);

    const rows = [...this.rowsOf(session), pickRow(repeat.keys, answers)];

    const kept: Record<string, string> = { ...answers, [PAGE_KEY]: '0', [FILTER_KEY]: '' };
    for (const key of repeat.keys) delete kept[key];

    const steps = visibleSteps(kind, kept);
    const answered = new Set(Object.keys(kept));
    const index = steps.findIndex((step) => !answered.has(step.key));

    const context = {
      ...((session.context ?? {}) as Record<string, unknown>),
      [repeat.bucket]: rows,
    };
    const updated = await this.prisma.botFlowSession.update({
      where: { id: session.id },
      data: {
        answers: kept as Prisma.InputJsonValue,
        context: context as unknown as Prisma.InputJsonValue,
        step: index < 0 ? steps.length : index,
      },
    });

    return this.render(updated, kept, index < 0 ? steps.length : index, repeat.parkedNote(rows.length));
  }

  /** The rows already parked for this operation, if it is one that repeats. */
  private rowsOf(session: BotFlowSession): Row[] {
    const repeat = REPEATABLE[session.flowKind as FlowKind];
    if (!repeat) return [];
    const context = (session.context ?? {}) as Record<string, unknown>;
    const rows = context[repeat.bucket];
    return Array.isArray(rows) ? (rows as Row[]) : [];
  }

  /** Everything tappable for a question, or null when the answer is typed. */
  private choicesFor(
    session: BotFlowSession,
    step: WizardStep,
    answers?: Record<string, string>,
  ): Option[] | null {
    if (step.kind === 'date') return this.dateOptions(step);
    if (step.kind !== 'choice') return null;
    return this.optionsFor(session, step, answers);
  }

  private optionsFor(
    session: BotFlowSession,
    step: WizardStep,
    answers?: Record<string, string>,
  ): Option[] {
    if (step.fixedOptions) return [...step.fixedOptions];
    if (!step.optionsKey) return [];

    const given = answers ?? ((session.answers ?? {}) as Record<string, string>);
    const key = typeof step.optionsKey === 'function' ? step.optionsKey(given) : step.optionsKey;

    const context = (session.context ?? {}) as Record<string, unknown>;
    const options = context[key];
    return Array.isArray(options) ? (options as Option[]) : [];
  }

  /**
   * The rows that do something other than answer the question.
   *
   * They go at the top and they are the whole point: search and "several
   * clients" already existed, but announced in a line of text under the
   * question that nobody reads — the list is what gets looked at.
   *
   * Titles stay short on purpose: `MAX_ROW_TITLE` cuts a row at 24 characters,
   * and "➕ Varios clientes a la vez" would arrive truncated.
   */
  private actionRows(
    session: BotFlowSession,
    step: WizardStep,
    answers: Record<string, string>,
    options: Option[] | null,
  ): ReplyButton[] {
    const rows: ReplyButton[] = [];
    const id = (value: string) => buildButtonId(BUTTON.WIZARD, session.flowToken, value);

    if (this.isSearchable(step, options)) {
      rows.push({
        id: id(SEARCH),
        title: '🔎 Buscar por nombre',
        description: 'Escribe y te muestro los que casen',
      });
    }

    // Only on the client question of a sale: that is where the buyer is
    // decided, and where the user went looking for them.
    if (session.flowKind !== 'sale' || step.key !== 'client') return rows;

    const parked = this.rowsOf(session).length;
    if (parked > 0) {
      rows.push({
        id: id(CONFIRM),
        title: `✅ Registrar ${parked}`,
        description: `Cierra la tanda con ${parked} venta${parked === 1 ? '' : 's'}`,
      });
    } else if (answers[RUN_KEY] !== '1') {
      rows.push({
        id: id(RUN),
        title: '➕ Varios clientes',
        description: 'Una venta por cliente, de una pasada',
      });
    }

    return rows;
  }

  /**
   * Turns a list into the rows of one page.
   *
   * A WhatsApp list holds ten rows and "Cancelar" always takes one. Beyond what
   * fits, the last row becomes "Ver más", which cycles rather than stopping — a
   * list that dead-ends on a page holding nothing but "Cancelar" is worse than one
   * that wraps.
   */
  private paginate(
    session: BotFlowSession,
    step: WizardStep,
    options: Option[],
    requestedPage: number,
    actions: ReplyButton[] = [],
  ): ReplyButton[] {
    const row = (option: Option): ReplyButton => ({
      id: buildButtonId(BUTTON.WIZARD, session.flowToken, option.id),
      title: option.title,
      description: option.description,
    });

    if (options.length <= MAX_ROWS - 1 - actions.length) {
      return [...actions, ...options.map(row)];
    }

    const size = pageSizeWith(actions.length);
    const pages = Math.ceil(options.length / size);
    const page = Math.min(Math.max(requestedPage, 0), pages - 1);

    return [
      ...actions,
      ...options.slice(page * size, (page + 1) * size).map(row),
      {
        id: buildButtonId(BUTTON.WIZARD, session.flowToken, NEXT_PAGE),
        title: step.kind === 'date' ? '⏭️ Ver más días' : '⏭️ Ver más',
        description: `Página ${page + 1} de ${pages}`,
      },
    ];
  }

  /**
   * The days you might be registering, nearest first.
   *
   * Not a calendar — that is the one thing the native form had that this cannot
   * do. Paging covers the same two months the form's calendar allowed, so
   * nothing became unreachable; it just takes a tap or two to get back there.
   */
  private dateOptions(step: WizardStep): Option[] {
    const timeZone = this.configService.get<string>('ASSISTANT_TIMEZONE') ?? DEFAULT_TIMEZONE;
    const today = todayIn(timeZone);
    const days: Option[] = [];

    // Forward first when the operation allows it — you plan a batch for today or
    // the coming days, not for last month.
    for (let offset = 0; offset <= (step.futureDays ?? 0); offset++) {
      days.push(dayOption(shiftDays(today, offset), today));
    }
    for (let offset = 1; offset <= CALENDAR_PAST_DAYS; offset++) {
      days.push(dayOption(shiftDays(today, -offset), today));
    }

    return days;
  }

  /** How an answer reads back on the confirmation screen. */
  private describe(
    session: BotFlowSession,
    step: WizardStep,
    raw: string,
    answers: Record<string, string>,
  ): string {
    if (step.kind === 'date') {
      const timeZone = this.configService.get<string>('ASSISTANT_TIMEZONE') ?? DEFAULT_TIMEZONE;
      return dayLabel(raw, todayIn(timeZone));
    }
    if (step.kind === 'choice') {
      const match = this.optionsFor(session, step, answers).find((option) => option.id === raw);
      return match?.title ?? raw;
    }
    if (step.kind === 'number') {
      // Read back the way it was typed: the stored value is normalised to a
      // dot, and "22.5 kg" is not how anyone here writes twenty-two and a half.
      const value = Number(raw);
      return Number.isFinite(value) ? formatQuantity(value) : raw;
    }
    return raw;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** es-VE: '.' groups thousands, ',' is the decimal separator. Trailing zeros dropped. */
function formatQuantity(value: number): string {
  return new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 }).format(value);
}

function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayOption(iso: string, todayIso: string): Option {
  return { id: iso, title: dayLabel(iso, todayIso), description: longDate(iso) };
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function dayLabel(iso: string, todayIso: string): string {
  const [, month, day] = iso.split('-');
  if (iso === todayIso) return `Hoy · ${day}/${month}`;
  if (iso === shiftDays(todayIso, -1)) return `Ayer · ${day}/${month}`;
  if (iso === shiftDays(todayIso, 1)) return `Mañana · ${day}/${month}`;

  const weekday = WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
  return `${weekday} ${day}/${month}`;
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function longDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${Number(day)} de ${MONTHS[Number(month) - 1]} de ${year}`;
}
