import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentMember, type CurrentMemberInfo } from '../../common/decorators/current-member.decorator';
import { roleSchema, roleUpdateSchema, type RoleInput, type RoleUpdateInput } from '@cryotech/shared-types';

@Controller('companies/:companyId/roles')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermission('settings', 'view')
  findAll(@CurrentCompanyId() companyId: string) {
    return this.rolesService.findAll(companyId);
  }

  @Get(':roleId')
  @RequirePermission('settings', 'view')
  findOne(@CurrentCompanyId() companyId: string, @Param('roleId') roleId: string) {
    return this.rolesService.findOne(companyId, roleId);
  }

  @Post()
  @RequirePermission('settings', 'edit')
  create(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(roleSchema)) body: RoleInput,
  ) {
    return this.rolesService.create(companyId, body);
  }

  /**
   * The permissions object is validated here, not just on create.
   *
   * It used to arrive as an unvalidated `object` and go straight into the JSON
   * column, so a member with `settings.edit` could write any shape they liked —
   * including the `{"all": true}` wildcard the guard honoured at the time.
   */
  @Patch(':roleId')
  @RequirePermission('settings', 'edit')
  update(
    @CurrentCompanyId() companyId: string,
    @CurrentMember() member: CurrentMemberInfo,
    @Param('roleId') roleId: string,
    @Body(new ZodValidationPipe(roleUpdateSchema)) body: RoleUpdateInput,
  ) {
    return this.rolesService.update(companyId, roleId, body, member);
  }

  @Delete(':roleId')
  @RequirePermission('settings', 'edit')
  remove(@CurrentCompanyId() companyId: string, @Param('roleId') roleId: string) {
    return this.rolesService.remove(companyId, roleId);
  }
}
