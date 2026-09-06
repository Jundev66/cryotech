import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** ::1, 127.0.0.0/8 and the IPv4-mapped form Node reports behind a dual stack. */
const LOOPBACK = /^(::1|::ffff:127\.|127\.)/;

/**
 * The throttler, with one exemption: loopback outside production.
 *
 * The limits exist to stop credential guessing from the network. The e2e suite
 * is not guessing — it registers a fresh throwaway account on every run, and a
 * five-per-quarter-hour cap locks the whole suite out on the second run of the
 * afternoon. Left as-is, the pressure is to loosen the production limit or to
 * delete the tests, and both are worse than this.
 *
 * The exemption cannot apply in production: `NODE_ENV` is set to `production`
 * in the image and validated at boot. And it is deliberately narrower than
 * "development mode" — an attacker on the network is not on loopback, and
 * behind nginx `trust proxy 1` makes `req.ip` the real client, not the proxy.
 */
@Injectable()
export class LoopbackAwareThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'production') return false;

    const request = context.switchToHttp().getRequest();
    const ip: string = request.ip ?? request.socket?.remoteAddress ?? '';

    return LOOPBACK.test(ip);
  }
}
