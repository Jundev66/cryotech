import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, PermissionRequirement } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requirement) return true;

    const request = context.switchToHttp().getRequest();
    const member = request.companyMember;

    if (!member) {
      throw new ForbiddenException('Company membership required');
    }

    // Owners have all permissions
    if (member.isOwner) return true;

    const permissions = member.role?.permissions as Record<string, Record<string, boolean>> | null;
    if (!permissions) {
      throw new ForbiddenException('No permissions assigned');
    }

    // There is deliberately no wildcard here.
    //
    // This used to honour `permissions.all === true`, which no role ever emits
    // (see the defaults in companies.service.ts) — it existed only as a
    // shortcut nobody used. Combined with the unvalidated body on
    // `PATCH /companies/:id/roles/:roleId`, it was a full privilege escalation:
    // any member holding `settings.edit` could rewrite their own role to
    // `{"all": true}` and inherit every permission in the company, including
    // deleting users and moving money. Permissions are now enumerated only.
    const modulePerms = permissions[requirement.module];
    if (!modulePerms || !modulePerms[requirement.action]) {
      throw new ForbiddenException(
        `Missing permission: ${requirement.module}.${requirement.action}`,
      );
    }

    return true;
  }
}
