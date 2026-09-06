import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @RequirePermission('reports', 'view')
  getStats(@CurrentCompanyId() companyId: string) {
    return this.dashboardService.getStats(companyId);
  }

  @Get('recent-activity')
  @RequirePermission('reports', 'view')
  getRecentActivity(@CurrentCompanyId() companyId: string) {
    return this.dashboardService.getRecentActivity(companyId);
  }

  @Get('batch-status-distribution')
  @RequirePermission('reports', 'view')
  getBatchStatusDistribution(@CurrentCompanyId() companyId: string) {
    return this.dashboardService.getBatchStatusDistribution(companyId);
  }
}
