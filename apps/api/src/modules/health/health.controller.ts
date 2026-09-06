import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * Liveness only, and deliberately trivial.
 *
 * Two callers depend on it. Render checks it to decide whether the instance is
 * healthy, and the Cloudflare Worker pings it the moment a WhatsApp message
 * arrives, to wake the instance from the free tier's fifteen-minute sleep
 * before the poller is needed.
 *
 * It must not touch the database. Neon's free compute suspends when idle and
 * bills by the hour it is awake, so a query here would wake it on every ping —
 * burning the monthly budget to answer a question nobody asked. Whether the
 * database is reachable is the poller's problem, and the poller finds out by
 * doing real work.
 *
 * Exempt from the throttler on purpose: answering Render's health check with a
 * 429 reads as "unhealthy" and gets the instance restarted, and rate-limiting a
 * constant that carries no credentials and touches no data protects nothing.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { ok: true };
  }
}
