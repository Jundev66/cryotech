import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { MeasurementUnitsService } from './measurement-units.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { measurementUnitSchema, type MeasurementUnitInput } from '@cryotech/shared-types';

@Controller('measurement-units')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class MeasurementUnitsController {
  constructor(private readonly service: MeasurementUnitsService) {}

  @Get()
  @RequirePermission('settings', 'view')
  findAll(@CurrentCompanyId() companyId: string) {
    return this.service.findAll(companyId);
  }

  @Post()
  @RequirePermission('settings', 'edit')
  create(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(measurementUnitSchema)) body: MeasurementUnitInput,
  ) {
    return this.service.create(companyId, body);
  }

  @Patch(':id')
  @RequirePermission('settings', 'edit')
  update(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(measurementUnitSchema.partial())) body: Partial<MeasurementUnitInput>,
  ) {
    return this.service.update(companyId, id, body);
  }

  @Delete(':id')
  @RequirePermission('settings', 'edit')
  remove(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.service.remove(companyId, id);
  }
}
