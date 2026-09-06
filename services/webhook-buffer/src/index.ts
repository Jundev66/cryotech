/**
 * Durable buffer between Meta and the CryoTech API.
 *
 * Meta needs a public HTTPS endpoint that answers within seconds; the API runs
 * on a laptop behind NAT that is not always on. This Worker sits in between:
 * it is always up, so Meta always gets its 200 and never retries or disables
 * the subscription, and the API pulls whenever it happens to be running.
 *
 * Because the API pulls rather than being pushed to, it needs no public URL,
 * no tunnel, and no inbound firewall hole.
 *
 * It also proxies the BCV homepage (`/bcv`), for reasons that have nothing to
 * do with the queue — see `fetchBcvPage`.
 */

export interface Env {
  DB: D1Database;
  /** Meta app secret — verifies the webhook signature. */
  META_APP_SECRET: string;
  /** Our own string, echoed back to Meta during webhook setup. */
  META_WHATSAPP_VERIFY_TOKEN: string;
  /** Shared secret the API presents when draining the queue. */
  PULL_TOKEN: string;
  /**
   * Health endpoint of the API, pinged to wake it when a message lands.
   *
   * Only needed where the API sleeps when idle — a free Render instance. Unset
   * on a host that is always on, and nothing here changes.
   */
  API_WAKE_URL?: string;
}

/** Acked rows are kept this long so a late redelivery still hits the primary key. */
const ACK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** The only trigger that prunes; the rest just wake the API. */
const HOUSEKEEPING_CRON = '0 4 * * *';
const MAX_PULL = 100;

const BCV_URL = 'https://www.bcv.org.ve/';
/** The BCV publishes once a day, so a quarter hour of staleness costs nothing. */
const BCV_CACHE_SECONDS = 900;
/** The site is routinely slow; the API's own budget is shorter and wins anyway. */
const BCV_TIMEOUT_MS = 20_000;
/** The BCV homepage is served to browsers only; a bare client gets a challenge page. */
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Enough to hand the request over; the cold start continues without us. */
const WAKE_TIMEOUT_MS = 5_000;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/webhook') {
      if (request.method === 'GET') return verifyWebhook(url, env);
      if (request.method === 'POST') return receiveWebhook(request, env, ctx);
      return new Response('Method not allowed', { status: 405 });
    }

    if (url.pathname === '/pending' && request.method === 'GET') {
      return requirePullToken(request, env) ?? (await listPending(url, env));
    }

    if (url.pathname === '/ack' && request.method === 'POST') {
      return requirePullToken(request, env) ?? (await ackEvents(request, env));
    }

    if (url.pathname === '/bcv' && request.method === 'GET') {
      return requirePullToken(request, env) ?? (await fetchBcvPage());
    }

    if (url.pathname === '/health') {
      return Response.json({ ok: true });
    }

    return new Response('Not found', { status: 404 });
  },

  /**
   * Two different jobs depending on the trigger (see wrangler.toml).
   *
   * The early one prunes; the morning and afternoon ones only wake the API,
   * because the cron that fetches the BCV rate runs inside its process, and on
   * a sleeping instance that process does not exist.
   */
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    if (event.cron === HOUSEKEEPING_CRON) {
      await env.DB.prepare('DELETE FROM inbound_events WHERE acked_at IS NOT NULL AND acked_at < ?')
        .bind(Date.now() - ACK_RETENTION_MS)
        .run();
      return;
    }

    await pingApi(env);
  },
};

// --- Meta side ------------------------------------------------------------

function verifyWebhook(url: URL, env: Env): Response {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === env.META_WHATSAPP_VERIFY_TOKEN && challenge) {
    // Echoed back verbatim as text. Coercing it to a number breaks setup when
    // Meta sends a non-numeric challenge.
    return new Response(challenge, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }

  return new Response('Forbidden', { status: 403 });
}

async function receiveWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // The signature covers the exact bytes, so read them before parsing.
  const raw = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!(await isSignatureValid(raw, signature, env.META_APP_SECRET))) {
    return new Response('Invalid signature', { status: 403 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Acknowledge anyway: retrying will not make it parse, and a non-200 would
    // count against the subscription's health.
    return new Response('EVENT_RECEIVED', { status: 200 });
  }

  const messages = extractMessages(payload);
  if (messages.length > 0) {
    const now = Date.now();
    // INSERT OR IGNORE: the message id is the primary key, so Meta redelivering
    // the same message simply does nothing.
    const statements = messages.map((message) =>
      env.DB.prepare(
        'INSERT OR IGNORE INTO inbound_events (id, received_at, payload) VALUES (?, ?, ?)',
      ).bind(message.id, now, JSON.stringify(message)),
    );
    await env.DB.batch(statements);

    // Queued and durable — now go wake whoever has to answer it.
    wakeApi(env, ctx);
  }

  return new Response('EVENT_RECEIVED', { status: 200 });
}

// --- API side -------------------------------------------------------------

/**
 * Nudges the API awake without waiting for it to get there.
 *
 * A free Render instance sleeps after fifteen minutes idle and only an inbound
 * request revives it — which the API's own outbound polling can never do, so
 * left alone it would sleep through every message. Render starts the cold boot
 * the moment its router accepts the request, so there is nothing to gain by
 * waiting for the reply: five seconds is enough to hand it over.
 *
 * Failure is not worth reporting. The message is already durable in D1, and the
 * only consequence is that the answer waits for whatever wakes the API next.
 * What must not happen is Meta waiting on this — hence `waitUntil`, which lets
 * the 200 go out immediately and the ping finish on its own time.
 */
function wakeApi(env: Env, ctx: ExecutionContext): void {
  ctx.waitUntil(pingApi(env));
}

/**
 * The fetch itself, shared with the scheduled trigger.
 *
 * A failure is not reported: the message is already safe in D1 and all that is
 * lost is speed. A timeout cancels nothing either — Render starts booting as
 * soon as its router accepts the request.
 */
async function pingApi(env: Env): Promise<void> {
  if (!env.API_WAKE_URL) return;

  try {
    await fetch(env.API_WAKE_URL, { signal: AbortSignal.timeout(WAKE_TIMEOUT_MS) });
  } catch {
    // Nothing to do here, and nothing to salvage.
  }
}

function requirePullToken(request: Request, env: Env): Response | null {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!env.PULL_TOKEN || !timingSafeEqualStrings(token, env.PULL_TOKEN)) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}

async function listPending(url: URL, env: Env): Promise<Response> {
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, MAX_PULL);

  // Oldest first: the API processes them in the order they arrived, which is
  // what makes a burst after downtime replay in the right sequence.
  const { results } = await env.DB.prepare(
    'SELECT id, received_at, payload FROM inbound_events WHERE acked_at IS NULL ORDER BY received_at ASC LIMIT ?',
  )
    .bind(limit)
    .all<{ id: string; received_at: number; payload: string }>();

  return Response.json({
    events: (results ?? []).map((row) => ({
      id: row.id,
      receivedAt: row.received_at,
      message: JSON.parse(row.payload),
    })),
  });
}

async function ackEvents(request: Request, env: Env): Promise<Response> {
  let body: { ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const ids = (body.ids ?? []).filter((id) => typeof id === 'string').slice(0, MAX_PULL);
  if (ids.length === 0) return Response.json({ acked: 0 });

  const placeholders = ids.map(() => '?').join(',');
  const result = await env.DB.prepare(
    `UPDATE inbound_events SET acked_at = ? WHERE id IN (${placeholders}) AND acked_at IS NULL`,
  )
    .bind(Date.now(), ...ids)
    .run();

  return Response.json({ acked: result.meta.changes ?? 0 });
}

// --- Exchange rate --------------------------------------------------------

/**
 * Proxies the BCV homepage so the API can price in bolivares from anywhere.
 *
 * Two problems, one fix. First, bcv.org.ve serves an incomplete certificate
 * chain: Node rejects it with UNABLE_TO_VERIFY_LEAF_SIGNATURE, which forced the
 * API to disable certificate verification — a flag `env.schema.ts` refuses to
 * accept in production, so the API could not boot on a server at all. The
 * Workers runtime has no such trouble with the chain. Second, the site is
 * reached far more reliably from Cloudflare's network than from a datacenter
 * outside Venezuela, and pricing a sale off a stale bolivar rate is a real loss.
 *
 * Deliberately returns the raw HTML rather than the parsed number: `parseBcvRate`
 * stays in the API as the single place that understands the markup, instead of
 * two copies that drift apart the next time the BCV redesigns its homepage.
 * Every sanity check — plausible range, drift tolerance — stays there too.
 */
async function fetchBcvPage(): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(BCV_URL, {
      headers: { 'user-agent': BROWSER_USER_AGENT, accept: 'text/html' },
      signal: AbortSignal.timeout(BCV_TIMEOUT_MS),
      // Serve the same page to every caller for a quarter hour: the assistant
      // asks on every message that mentions money, and the BCV is slow enough
      // that hitting it each time would be felt in the reply.
      cf: { cacheTtl: BCV_CACHE_SECONDS, cacheEverything: true },
    });
  } catch (error) {
    // 502 rather than a fabricated empty page: the API distinguishes "could not
    // fetch" from "fetched but could not parse", and only the second means the
    // markup changed.
    return new Response(`BCV unreachable: ${(error as Error)?.message ?? 'unknown error'}`, {
      status: 502,
    });
  }

  if (!upstream.ok) {
    return new Response(`BCV responded ${upstream.status}`, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'text/html; charset=utf-8',
      'cache-control': `public, max-age=${BCV_CACHE_SECONDS}`,
    },
  });
}

// --- Helpers --------------------------------------------------------------

interface MetaMessage {
  id: string;
  from: string;
  type: string;
  /**
   * The WhatsApp Business Account this arrived on. Meta does not expose it on
   * any readable field of the phone number node, and it is required to publish
   * Flows — so it is captured here, where it comes for free.
   */
  wabaId?: string;
  [key: string]: unknown;
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{ id?: string; changes?: Array<{ value?: { messages?: MetaMessage[] } }> }>;
}

/**
 * Pulls out the actual messages, dropping everything else.
 *
 * Meta also posts delivery-status events for every message we send. The API
 * ignores them, so filtering here keeps them out of the queue entirely rather
 * than paying to store and pull noise.
 */
function extractMessages(payload: MetaWebhookPayload): MetaMessage[] {
  if (payload.object !== 'whatsapp_business_account') return [];

  const messages: MetaMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (message?.id) messages.push({ ...message, wabaId: entry.id });
      }
    }
  }
  return messages;
}

async function isSignatureValid(
  raw: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false;
  if (!signature.startsWith('sha256=')) return false;

  const expectedHex = signature.slice(7);
  if (!/^[0-9a-f]+$/i.test(expectedHex) || expectedHex.length !== 64) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  // crypto.subtle.verify compares in constant time.
  return crypto.subtle.verify('HMAC', key, hexToBytes(expectedHex), new TextEncoder().encode(raw));
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/** Length-independent comparison so a wrong token leaks nothing through timing. */
function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
