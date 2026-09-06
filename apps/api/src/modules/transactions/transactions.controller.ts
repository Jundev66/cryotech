import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { transactionSchema } from '@cryotech/shared-types';
import type { TransactionInput } from '@cryotech/shared-types';

@Controller('transactions')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @RequirePermission('transactions', 'view')
  findAll(
    @CurrentCompanyId() companyId: string,
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('batchId') batchId?: string,
    @Query('sourceType') sourceType?: string,
    @Query('search') search?: string,
  ) {
    return this.transactionsService.findAll(companyId, { type, category, startDate, endDate, batchId, sourceType, search });
  }

  @Get('cash-flow')
  @RequirePermission('transactions', 'view')
  getCashFlow(
    @CurrentCompanyId() companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('batchId') batchId?: string,
  ) {
    return this.transactionsService.getCashFlow(companyId, { startDate, endDate, batchId });
  }

  @Post()
  @RequirePermission('transactions', 'create')
  create(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(transactionSchema)) body: TransactionInput,
  ) {
    return this.transactionsService.create(companyId, body);
  }

  @Get(':id')
  @RequirePermission('transactions', 'view')
  findOne(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.transactionsService.findOne(companyId, id);
  }
}
