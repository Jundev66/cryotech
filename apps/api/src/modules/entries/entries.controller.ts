import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { EntriesService } from './entries.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { productEntrySchema, payablePaymentSchema } from '@cryotech/shared-types';
import type { ProductEntryInput, PayablePaymentInput } from '@cryotech/shared-types';
import { EntryStatus, PaymentStatus } from '@prisma/client';
import { parseEnum } from '../../common/parse-enum.util';

@Controller('entries')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class EntriesController {
  constructor(private readonly entriesService: EntriesService) {}

  @Get()
  @RequirePermission('entries', 'view')
  findAll(
    @CurrentCompanyId() companyId: string,
    @Query('productId') productId?: string,
    @Query('batchId') batchId?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('search') search?: string,
  ) {
    return this.entriesService.findAll(companyId, {
      productId,
      batchId,
      status: parseEnum(EntryStatus, status, 'status'),
      paymentStatus: parseEnum(PaymentStatus, paymentStatus, 'paymentStatus'),
      search,
    });
  }

  @Get(':id')
  @RequirePermission('entries', 'view')
  findOne(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.entriesService.findOne(companyId, id);
  }

  @Post()
  @RequirePermission('entries', 'create')
  create(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(productEntrySchema)) body: ProductEntryInput,
  ) {
    return this.entriesService.create(companyId, body);
  }

  /** Receiving recognises the expense and moves stock. It says nothing about payment. */
  @Patch(':id/receive')
  @RequirePermission('entries', 'edit')
  receive(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.entriesService.receive(companyId, id);
  }

  /** Paying moves cash. Works before or after receiving. Alias of `/payables/entry/:id/payments`. */
  @Post(':id/payments')
  @RequirePermission('entries', 'edit')
  registerPayment(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(payablePaymentSchema)) body: PayablePaymentInput,
  ) {
    return this.entriesService.registerPayment(companyId, id, body);
  }

  @Get(':id/payments')
  @RequirePermission('entries', 'view')
  getPayments(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.entriesService.getPayments(companyId, id);
  }

  @Delete(':id')
  @RequirePermission('entries', 'delete')
  remove(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.entriesService.remove(companyId, id);
  }
}
