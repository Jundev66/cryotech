import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** The column is `uuid`, so anything else is a malformed request, not a 500. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CompanyMembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    // JwtAuthGuard must run first. If it did not, this guard would query with
    // `userId: undefined` and Prisma would throw a 500 that reads like a bug
    // rather than the misconfiguration it is.
    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }

    const header = request.headers['x-company-id'];

    // Express hands back an array when a header arrives more than once. That
    // used to reach Prisma as-is and blow up with an unlogged 500; a repeated
    // header is a bad request and should say so.
    if (Array.isArray(header)) {
      throw new BadRequestException('X-Company-Id must be sent exactly once');
    }
    if (!header) {
      throw new BadRequestException('X-Company-Id header is required');
    }
    if (!UUID.test(header)) {
      throw new BadRequestException('X-Company-Id must be a valid UUID');
    }

    const companyId = header;

    // Some routes are mounted under `companies/:companyId/...` while the value
    // that actually scopes the query comes from the header. That divergence is
    // harmless today only because every service reads the header — but a route
    // that starts trusting the path segment instead would be reading a company
    // nobody checked membership for. Requiring the two to agree removes the
    // question: there is only ever one company in play.
    const pathCompanyId = request.params?.companyId;
    if (pathCompanyId && pathCompanyId !== companyId) {
      throw new BadRequestException('X-Company-Id does not match the company in the URL');
    }

    const member = await this.prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId, userId } },
      include: { role: true },
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this company');
    }

    request.companyId = companyId;
    request.companyMember = member;
    return true;
  }
}
