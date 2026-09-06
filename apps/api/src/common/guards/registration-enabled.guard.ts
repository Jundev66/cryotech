import { Injectable, CanActivate, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Closes public sign-up when the deployment does not want it open.
 *
 * While the API lived on a laptop behind NAT, `register` was unreachable from
 * outside and its only limit — five attempts per IP every fifteen minutes —
 * was enough. On Render the API has a mandatory public URL, and that limit no
 * longer bounds much: anyone rotating addresses can create users and companies
 * until Neon's 500 MB are full.
 *
 * The default is decided by `NODE_ENV` and is asymmetric on purpose: closed in
 * production, open outside it. A new deployment where nobody remembers the
 * variable fails safe, and the e2e suite — which creates a throwaway account
 * per run — still works with nothing configured.
 */
@Injectable()
export class RegistrationEnabledGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(): boolean {
    const configured = this.configService.get<string>('REGISTRATION_ENABLED');
    const enabled =
      configured === undefined || configured === ''
        ? this.configService.get<string>('NODE_ENV') !== 'production'
        : configured === 'true';

    if (!enabled) {
      // 403, not 404: the route exists and is disabled on purpose. Pretending
      // it is missing hides nothing — the login next to it gives it away — and
      // leaves the operator unable to tell "off" from "broken".
      throw new ForbiddenException('El registro de nuevas cuentas está deshabilitado');
    }

    return true;
  }
}
