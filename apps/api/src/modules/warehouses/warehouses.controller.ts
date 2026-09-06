import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { warehouseSchema, type WarehouseInput } from '@cryotech/shared-types';

@Controller('warehouses')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  @RequirePermission('warehouses', 'view')
  findAll(@CurrentCompanyId() companyId: string, @Query('search') search?: string) {
    return this.warehousesService.findAll(companyId, { search });
  }

  @Get(':id')
  @RequirePermission('warehouses', 'view')
  findOne(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.warehousesService.findOne(companyId, id);
  }

  @Post()
  @RequirePermission('warehouses', 'create')
  create(@CurrentCompanyId() companyId: string, @Body(new ZodValidationPipe(warehouseSchema)) body: { name: string; capacity?: number; location?: string }) {
    return this.warehousesService.create(companyId, body);
  }

  @Patch(':id')
  @RequirePermission('warehouses', 'edit')
  update(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(warehouseSchema.partial())) body: Partial<WarehouseInput>,
  ) {
    return this.warehousesService.update(companyId, id, body);
  }

  @Delete(':id')
  @RequirePermission('warehouses', 'delete')
  remove(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.warehousesService.remove(companyId, id);
  }
}
