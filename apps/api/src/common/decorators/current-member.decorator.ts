import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * The caller's membership row, as resolved by CompanyMembershipGuard.
 *
 * Carries `isOwner` and the joined role, which is what lets a service tell
 * "this user is editing someone else's role" from "this user is editing the
 * one that grants them their own permissions".
 */
export interface CurrentMemberInfo {
  id: string;
  companyId: string;
  userId: string;
  roleId: string | null;
  isOwner: boolean;
}

export const CurrentMember = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentMemberInfo => {
    return ctx.switchToHttp().getRequest().companyMember;
  },
);
