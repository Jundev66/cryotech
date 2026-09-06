import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { WhatsappTransportService, type MetaMessage } from './whatsapp-transport.service';
import { AssistantInboundService } from '../assistant/inbound/assistant-inbound.service';

const DEFAULT_POLL_SECONDS = 10;
const PULL_BATCH = 25;

interface BufferedEvent {
  id: string;
  receivedAt: number;
  message: MetaMessage;
}

/**
 * Drains the Cloudflare buffer and hands each message to the assistant.
 *
 * Pull rather than push: Meta needs an endpoint that answers in seconds and
 * verifies a signature, and the Worker does both, so this side makes only
 * outbound calls and the queue simply waits while it is down.
 *
 * Everything past "here is a message" — idempotency, the allowlist, the
 * dispatch, the receipt batching — belongs to AssistantInboundService, so it
 * behaves identically on every channel.
 */
@Injectable()
export class WhatsappPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappPollerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly transport: WhatsappTransportService,
    private readonly inbound: AssistantInboundService,
  ) {}

  onModuleInit() {
    if (!this.bufferUrl || !this.pullToken) {
      this.logger.warn('BUFFER_URL/BUFFER_PULL_TOKEN not set — the WhatsApp poller stays idle');
      return;
    }
    // Drain immediately on boot: after downtime there is usually a backlog, and
    // the user is waiting on it.
    void this.tick();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule() {
    if (this.stopped) return;
    const seconds = Number(this.configService.get('BUFFER_POLL_SECONDS') ?? DEFAULT_POLL_SECONDS);
    this.timer = setTimeout(() => void this.tick(), Math.max(2, seconds) * 1000);
    this.timer.unref?.();
  }

  private async tick() {
    // A slow receipt (OCR plus a model call) can outlast the interval; without
    // this guard two runs would process the same event concurrently.
    if (this.running) return;
    this.running = true;

    try {
      let drained = 0;
      // Keep pulling while the queue is full: a backlog should clear in one
      // pass rather than one batch per interval.
      for (;;) {
        const events = await this.pull();
        if (events.length === 0) break;

        // One at a time, in order. `handle` never throws, so one bad message
        // cannot abandon the rest of the batch.
        for (const event of events) {
          await this.inbound.handle(this.transport.toEnvelope(event.message));
        }

        // NOTE: every event is acked, including any that failed. That is why
        // the WhatsApp envelope declares `redelivers: false` — a released claim
        // would never be served again, because `listPending` only returns rows
        // with `acked_at IS NULL`. Acking only what actually completed is what
        // would turn the retry back on.
        await this.ack(events.map((event) => event.id));

        drained += events.length;
        if (events.length < PULL_BATCH) break;
      }

      if (drained > 0) this.logger.log(`Processed ${drained} message(s) from the buffer`);
    } catch (error) {
      this.logger.error('Poll cycle failed', (error as Error)?.message);
    } finally {
      this.running = false;
      this.schedule();
    }
  }

  /** Events arrive oldest-first and are handled one at a time, in order. */
  private async pull(): Promise<BufferedEvent[]> {
    const { data } = await firstValueFrom(
      this.httpService.get<{ events: BufferedEvent[] }>(
        `${this.bufferUrl}/pending?limit=${PULL_BATCH}`,
        {
          timeout: 15_000,
          headers: { Authorization: `Bearer ${this.pullToken}` },
        },
      ),
    );
    return data.events ?? [];
  }

  private async ack(ids: string[]) {
    if (ids.length === 0) return;
    await firstValueFrom(
      this.httpService.post(
        `${this.bufferUrl}/ack`,
        { ids },
        { timeout: 15_000, headers: { Authorization: `Bearer ${this.pullToken}` } },
      ),
    );
  }

  private get bufferUrl(): string {
    return (this.configService.get<string>('BUFFER_URL') ?? '').replace(/\/$/, '');
  }

  private get pullToken(): string {
    return this.configService.get<string>('BUFFER_PULL_TOKEN') ?? '';
  }
}
