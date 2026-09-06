import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { MembersService } from './members.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  memberAddSchema,
  memberUpdateSchema,
  memberPasswordSchema,
  type MemberAddInput,
  type MemberUpdateInput,
  type MemberPasswordInput,
} from '@cryotech/shared-types';

@Controller('companies/:companyId/members')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  @RequirePermission('users', 'view')
  findAll(@CurrentCompanyId() companyId: string) {
    return this.membersService.findAll(companyId);
  }

  @Get(':memberId')
  @RequirePermission('users', 'view')
  findOne(@CurrentCompanyId() companyId: string, @Param('memberId') memberId: string) {
    return this.membersService.findOne(companyId, memberId);
  }

  @Post()
  @RequirePermission('users', 'create')
  addMember(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(memberAddSchema)) body: MemberAddInput,
  ) {
    return this.membersService.addMember(companyId, body);
  }

  @Patch(':memberId')
  @RequirePermission('users', 'edit')
  updateMember(
    @CurrentCompanyId() companyId: string,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(memberUpdateSchema)) body: MemberUpdateInput,
  ) {
    return this.membersService.updateMember(companyId, memberId, body);
  }

  /**
   * `users.edit` and not `users.create`: this edits someone already there, and
   * it is the same key that allows changing their role.
   */
  @Post(':memberId/password')
  @RequirePermission('users', 'edit')
  setPassword(
    @CurrentCompanyId() companyId: string,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(memberPasswordSchema)) body: MemberPasswordInput,
  ) {
    return this.membersService.setPassword(companyId, memberId, body.password);
  }

  @Delete(':memberId')
  @RequirePermission('users', 'delete')
  removeMember(@CurrentCompanyId() companyId: string, @Param('memberId') memberId: string) {
    return this.membersService.removeMember(companyId, memberId);
  }
}
