import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('fcr-trend')
  @RequirePermission('reports', 'view')
  getFcrTrend(@CurrentCompanyId() companyId: string, @Query('batchId') batchId?: string) {
    return this.reportsService.getFcrTrend(companyId, batchId);
  }

  @Get('mortality-by-batch')
  @RequirePermission('reports', 'view')
  getMortalityByBatch(@CurrentCompanyId() companyId: string) {
    return this.reportsService.getMortalityByBatch(companyId);
  }

  @Get('revenue-expense')
  @RequirePermission('reports', 'view')
  getRevenueExpense(
    @CurrentCompanyId() companyId: string,
    @Query('months') months?: string,
  ) {
    return this.reportsService.getRevenueExpense(companyId, months ? parseInt(months, 10) : 12);
  }

  @Get('growth-curve')
  @RequirePermission('reports', 'view')
  getGrowthCurve(@CurrentCompanyId() companyId: string, @Query('batchId') batchId: string) {
    return this.reportsService.getGrowthCurve(companyId, batchId);
  }

  @Get('batch-profitability')
  @RequirePermission('reports', 'view')
  getBatchProfitability(@CurrentCompanyId() companyId: string) {
    return this.reportsService.getBatchProfitability(companyId);
  }

  @Get('top-batches')
  @RequirePermission('reports', 'view')
  getTopBatches(@CurrentCompanyId() companyId: string) {
    return this.reportsService.getTopBatches(companyId);
  }

  // --- Cobranza ---

  @Get('receivables-by-client')
  @RequirePermission('reports', 'view')
  getReceivablesByClient(@CurrentCompanyId() companyId: string) {
    return this.reportsService.getReceivablesByClient(companyId);
  }

  @Get('client-statement')
  @RequirePermission('reports', 'view')
  getClientStatement(
    @CurrentCompanyId() companyId: string,
    @Query('clientId') clientId: string,
  ) {
    return this.reportsService.getClientStatement(companyId, clientId);
  }

  @Get('overdue-sales')
  @RequirePermission('reports', 'view')
  getOverdueSales(@CurrentCompanyId() companyId: string) {
    return this.reportsService.getOverdueSales(companyId);
  }
}
