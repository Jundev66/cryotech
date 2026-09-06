import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { DailyLogsService } from './daily-logs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { dailyLogSchema, type DailyLogInput } from '@cryotech/shared-types';

@Controller('daily-logs')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class DailyLogsController {
  constructor(private readonly dailyLogsService: DailyLogsService) {}

  @Get()
  @RequirePermission('daily_logs', 'view')
  findAll(@CurrentCompanyId() companyId: string, @Query('batchId') batchId?: string) {
    return this.dailyLogsService.findAll(companyId, batchId);
  }

  @Get(':id')
  @RequirePermission('daily_logs', 'view')
  findOne(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.dailyLogsService.findOne(companyId, id);
  }

  @Post()
  @RequirePermission('daily_logs', 'create')
  create(@CurrentCompanyId() companyId: string, @Body(new ZodValidationPipe(dailyLogSchema)) body: DailyLogInput) {
    return this.dailyLogsService.create(companyId, body);
  }

  @Patch(':id')
  @RequirePermission('daily_logs', 'edit')
  update(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(dailyLogSchema.partial())) body: Partial<DailyLogInput>,
  ) {
    return this.dailyLogsService.update(companyId, id, body);
  }

  @Delete(':id')
  @RequirePermission('daily_logs', 'delete')
  remove(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.dailyLogsService.remove(companyId, id);
  }
}
