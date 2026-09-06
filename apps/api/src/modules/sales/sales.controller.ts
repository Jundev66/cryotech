import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PaymentStatus } from '@prisma/client';
import { parseEnum } from '../../common/parse-enum.util';
import {
  saleSchema,
  bulkSaleSchema,
  salePaymentSchema,
  type SaleInput,
  type BulkSaleInput,
  type SalePaymentInput,
} from '@cryotech/shared-types';

@Controller('sales')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @RequirePermission('sales', 'view')
  findAll(
    @CurrentCompanyId() companyId: string,
    @Query('batchId') batchId?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('search') search?: string,
  ) {
    return this.salesService.findAll(companyId, {
      batchId,
      paymentStatus: parseEnum(PaymentStatus, paymentStatus, 'paymentStatus'),
      search,
    });
  }

  @Get(':id')
  @RequirePermission('sales', 'view')
  findOne(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.salesService.findOne(companyId, id);
  }

  // Declared before `@Post()` so the static segment is matched first — there is
  // no `POST /sales/:id` today, but the habit costs nothing.
  @Post('bulk')
  @RequirePermission('sales', 'create')
  createMany(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(bulkSaleSchema)) body: BulkSaleInput,
  ) {
    return this.salesService.createMany(companyId, body);
  }

  @Post()
  @RequirePermission('sales', 'create')
  create(@CurrentCompanyId() companyId: string, @Body(new ZodValidationPipe(saleSchema)) body: SaleInput) {
    return this.salesService.create(companyId, body);
  }

  @Post(':id/payments')
  @RequirePermission('sales', 'edit')
  registerPayment(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(salePaymentSchema)) body: SalePaymentInput,
  ) {
    return this.salesService.registerPayment(companyId, id, body);
  }

  @Get(':id/payments')
  @RequirePermission('sales', 'view')
  getPayments(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.salesService.getPayments(companyId, id);
  }

  @Patch(':id')
  @RequirePermission('sales', 'edit')
  update(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saleSchema.partial())) body: Partial<SaleInput>,
  ) {
    return this.salesService.update(companyId, id, body);
  }

  @Delete(':id')
  @RequirePermission('sales', 'delete')
  remove(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.salesService.remove(companyId, id);
  }
}
