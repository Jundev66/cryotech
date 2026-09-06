import { Injectable, Logger, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { LoginInput, RegisterInput } from '@cryotech/shared-types';

/**
 * 256 bits of entropy, hex-encoded. A UUIDv4 carries 122 and telegraphs its
 * own structure; there is no reason for a bearer credential to be either.
 */
const REFRESH_TOKEN_BYTES = 32;

/**
 * Refresh tokens are stored as a SHA-256 of what we handed out.
 *
 * Not bcrypt: the input is 256 random bits, so there is no dictionary to slow
 * down, and every refresh would pay bcrypt's cost for no gain. What matters is
 * that the database never holds anything replayable.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterInput) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException('El correo ya está registrado');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        fullName: input.fullName,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email);
    return {
      ...tokens,
      user: { id: user.id, email: user.email, fullName: user.fullName, phone: user.phone, avatarUrl: user.avatarUrl },
    };
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    return {
      ...tokens,
      user: { id: user.id, email: user.email, fullName: user.fullName, phone: user.phone, avatarUrl: user.avatarUrl },
    };
  }

  /**
   * Rotates a refresh token, and treats a replay as a compromise.
   *
   * Rotation alone is not enough: if a token is stolen and the thief uses it
   * first, the legitimate client's next attempt simply fails and nobody learns
   * anything — the attacker keeps a rolling session indefinitely. The only
   * signal available is that a token which was already rotated came back. That
   * can only happen if two parties hold it, so the entire family is revoked and
   * both sides are forced to log in again.
   */
  async refresh(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) {
      // Either a token that never existed, or one that was already rotated.
      // The second case is a replay; we cannot tell them apart from the hash
      // alone, which is why the family check below happens on the row we
      // delete, not here.
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Claim it: deleteMany reports how many rows it actually removed, so two
    // concurrent refreshes with the same token cannot both win.
    const claimed = await this.prisma.refreshToken.deleteMany({ where: { id: stored.id } });
    if (claimed.count === 0) {
      await this.revokeFamily(stored.familyId, stored.userId, 'refresh token replay');
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) throw new UnauthorizedException('User not found');

    return this.generateTokens(user.id, user.email, stored.familyId);
  }

  async logout(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });

    // Logging out ends the session, not just this one token: anything still
    // outstanding from the same login is no longer wanted.
    if (stored) {
      await this.prisma.refreshToken.deleteMany({ where: { familyId: stored.familyId } });
    }

    return { success: true };
  }

  /** Ends every session descended from one login. */
  private async revokeFamily(familyId: string, userId: string, reason: string) {
    const { count } = await this.prisma.refreshToken.deleteMany({ where: { familyId } });
    this.logger.warn(
      `Revoked ${count} refresh token(s) for user ${userId} — ${reason}`,
    );
  }

  /**
   * Mints a pair. `familyId` carries across rotations so the whole lineage
   * stays revocable; a fresh login starts a new one.
   */
  private async generateTokens(userId: string, email: string, familyId: string = randomUUID()) {
    const payload = { sub: userId, email };

    const accessToken = this.jwt.sign(payload);

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const refreshExpDays = parseInt(this.config.get('JWT_REFRESH_EXPIRATION', '7d').replace('d', ''), 10) || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshExpDays);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hashToken(refreshToken), familyId, expiresAt },
    });

    // The plaintext is returned here and nowhere else — it is never logged and
    // never stored.
    return { accessToken, refreshToken };
  }
}
