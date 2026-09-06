import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlowSessionService } from './flow-session.service';
import { FlowDataService } from './flow-data.service';
import { FlowSubmissionService } from './flow-submission.service';
import { FLOWS, type FlowKind } from './flow.catalog';
import type { OutgoingMessage } from '../types/assistant.types';

/**
 * Sends forms and takes their answers.
 *
 * The ids come from `WHATSAPP_FLOW_IDS`, written by
 * `services/whatsapp-flows/publish.sh` — the same script that validates the
 * layouts against Meta. A form that has not been published yet simply is not
 * offered, rather than failing when tapped.
 */
@Injectable()
export class FlowService {
  private readonly logger = new Logger(FlowService.name);

  constructor(
    private readonly sessions: FlowSessionService,
    private readonly data: FlowDataService,
    private readonly submissions: FlowSubmissionService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Whether this form can actually be opened in a chat.
   *
   * Having an id is not enough, and assuming it was is how the menu once
   * answered "Nueva venta" with no buttons: the five forms exist and validate,
   * but Meta refuses to deliver them from an unregistered business, so they sit
   * in DRAFT forever. Turning them on is therefore a deliberate act —
   * `WHATSAPP_FLOWS_ENABLED=true`, set only once a send has really worked.
   */
  isAvailable(kind: FlowKind): boolean {
    if (this.configService.get('WHATSAPP_FLOWS_ENABLED') !== 'true') return false;
    return Boolean(this.flowIds()[FLOWS[kind].file]);
  }

  /**
   * Builds the message that opens a form.
   *
   * Returns plain text instead when the form cannot be filled in — there is no
   * point opening "registrar venta" with no batches to sell from.
   */
  async open(
    companyId: string,
    kind: FlowKind,
    channel: string,
    externalUserId: string,
  ): Promise<OutgoingMessage> {
    const flowId = this.flowIds()[FLOWS[kind].file];
    if (!flowId) {
      return {
        text: 'Ese formulario todavía no está publicado en WhatsApp. Por ahora regístralo en la web.',
      };
    }

    const payload = await this.data.build(companyId, kind);
    if (payload.blocked) return { text: payload.blocked };

    const session = await this.sessions.open({
      companyId,
      channel,
      externalUserId,
      flowKind: kind,
      context: payload.context as never,
    });

    return {
      text: FLOWS[kind].header,
      flow: {
        flowId,
        flowToken: session.flowToken,
        screen: FLOWS[kind].screen,
        cta: FLOWS[kind].cta,
        header: FLOWS[kind].header,
        data: payload.data,
        // Sending the unpublished version is how a form gets tried before it is
        // released. Meta refuses it from an unverified business just like
        // publishing, so it is off unless somebody is deliberately testing.
        draft: this.configService.get('WHATSAPP_FLOWS_DRAFT') === 'true',
      },
    };
  }

  /**
   * Handles a submitted form.
   *
   * Returns null — say nothing — for a token that was already used. Meta
   * redelivers webhooks, and answering a replay would both confuse and cost an
   * outbound message.
   */
  async handleSubmission(
    flowToken: string,
    submission: Record<string, unknown>,
  ): Promise<OutgoingMessage | null> {
    const session = await this.sessions.claim(flowToken);
    if (!session) {
      const reason = await this.sessions.describeUnclaimable(flowToken);
      return reason ? { text: reason } : null;
    }

    try {
      const result = await this.submissions.execute(session, submission);
      await this.sessions.markExecuted(session.id, result.resultType, result.resultId);
      return result.reply;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Flow ${session.flowKind} failed: ${message}`);
      await this.sessions.markFailed(session.id, message);
      return { text: `⚠️ No pude registrarlo: ${message}` };
    }
  }

  /** `{"sale":"109...","daily-log":"286..."}` — the map publish.sh emits. */
  private flowIds(): Record<string, string> {
    const raw = this.configService.get<string>('WHATSAPP_FLOW_IDS');
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      this.logger.warn('WHATSAPP_FLOW_IDS no es JSON válido; no se ofrecerá ningún formulario');
      return {};
    }
  }
}
