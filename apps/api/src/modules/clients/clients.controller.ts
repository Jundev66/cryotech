import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { clientSchema, type ClientInput } from '@cryotech/shared-types';

@Controller('clients')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @RequirePermission('clients', 'view')
  findAll(
    @CurrentCompanyId() companyId: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit);
    return this.clientsService.findAll(companyId, {
      search,
      limit: Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('clients', 'view')
  findOne(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.clientsService.findOne(companyId, id);
  }

  @Post()
  @RequirePermission('clients', 'create')
  create(@CurrentCompanyId() companyId: string, @Body(new ZodValidationPipe(clientSchema)) body: ClientInput) {
    return this.clientsService.create(companyId, body);
  }

  @Patch(':id')
  @RequirePermission('clients', 'edit')
  update(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(clientSchema.partial())) body: Partial<ClientInput>,
  ) {
    return this.clientsService.update(companyId, id, body);
  }

  @Delete(':id')
  @RequirePermission('clients', 'delete')
  remove(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.clientsService.remove(companyId, id);
  }
}
