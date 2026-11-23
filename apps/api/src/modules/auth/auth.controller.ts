import { Controller, Post, Body, UsePipes, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { DemoService } from '../demo/demo.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RegistrationEnabledGuard } from '../../common/guards/registration-enabled.guard';
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  type RefreshTokenInput,
} from '@cryotech/shared-types';

/**
 * Rate limits here are far tighter than the global default because these are
 * the only routes where guessing pays: everything else needs a valid token
 * first. Without them, `login` accepted unlimited attempts against passwords
 * that only had to be six characters long.
 *
 * Counted per IP over 15 minutes. A person who genuinely mistyped their
 * password five times can wait; a script cannot work with five tries.
 */
const FIFTEEN_MINUTES = 15 * 60_000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly demoService: DemoService,
  ) {}

  @Post('demo')
  @Throttle({ default: { ttl: FIFTEEN_MINUTES, limit: 10 } })
  createDemoSession(
    @Body() body?: { email?: string; fullName?: string; phone?: string; farmSize?: string; source?: string },
    @Req() req?: Request,
  ) {
    if (body?.phone && body?.fullName) {
      const forwarded = req?.headers['x-forwarded-for'];
      const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req?.ip || '';
      return this.demoService.captureLeadAndCreateSession(
        {
          fullName: body.fullName,
          phone: body.phone,
          email: body.email || '',
          farmSize: body.farmSize || '',
          source: (body.source as any) || 'erp_landing',
        },
        clientIp,
      );
    }
    return this.demoService.createDemoSession(body);
  }

  @Post('register')
  @UseGuards(RegistrationEnabledGuard)
  @Throttle({ default: { ttl: FIFTEEN_MINUTES, limit: 5 } })
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() body: { fullName: string; email: string; password: string; confirmPassword: string }) {
    return this.authService.register(body);
  }

  @Post('login')
  @Throttle({ default: { ttl: FIFTEEN_MINUTES, limit: 5 } })
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body);
  }

  /**
   * More generous than login: a legitimate client refreshes on a timer and on
   * every tab it has open, and locking that out logs the user out. Still
   * bounded, because a stolen token is worth replaying.
   */
  @Post('refresh')
  @Throttle({ default: { ttl: FIFTEEN_MINUTES, limit: 30 } })
  @UsePipes(new ZodValidationPipe(refreshTokenSchema))
  refresh(@Body() body: RefreshTokenInput) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  @UsePipes(new ZodValidationPipe(refreshTokenSchema))
  logout(@Body() body: RefreshTokenInput) {
    return this.authService.logout(body.refreshToken);
  }
}
