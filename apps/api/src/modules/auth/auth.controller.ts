import { Controller, Post, Body, UsePipes, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
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
  constructor(private readonly authService: AuthService) {}

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
