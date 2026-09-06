import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  batchWithEntriesSchema,
  batchSchema,
  batchStatusUpdateSchema,
  batchEntryLineSchema,
  type BatchWithEntriesInput,
  type BatchInput,
  type BatchStatusUpdateInput,
  type BatchEntryLineInput,
} from '@cryotech/shared-types';

@Controller('batches')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Get()
  @RequirePermission('batches', 'view')
  findAll(@CurrentCompanyId() companyId: string, @Query('search') search?: string) {
    return this.batchesService.findAll(companyId, { search });
  }

  @Get(':id')
  @RequirePermission('batches', 'view')
  findOne(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.batchesService.findOne(companyId, id);
  }

  @Post()
  @RequirePermission('batches', 'create')
  create(@CurrentCompanyId() companyId: string, @Body(new ZodValidationPipe(batchWithEntriesSchema)) body: BatchWithEntriesInput) {
    return this.batchesService.create(companyId, body);
  }

  @Patch(':id')
  @RequirePermission('batches', 'edit')
  update(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(batchSchema.partial())) body: Partial<BatchInput>,
  ) {
    return this.batchesService.update(companyId, id, body);
  }

  @Patch(':id/status')
  @RequirePermission('batches', 'edit')
  updateStatus(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(batchStatusUpdateSchema)) body: BatchStatusUpdateInput,
  ) {
    return this.batchesService.updateStatus(companyId, id, body.status);
  }

  @Post(':id/entry-lines')
  @RequirePermission('batches', 'edit')
  addEntryLine(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(batchEntryLineSchema)) body: BatchEntryLineInput,
  ) {
    return this.batchesService.addEntryLine(companyId, id, body);
  }

  @Patch(':id/entry-lines/:lineId')
  @RequirePermission('batches', 'edit')
  updateEntryLine(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body(new ZodValidationPipe(batchEntryLineSchema.partial())) body: Partial<BatchEntryLineInput>,
  ) {
    return this.batchesService.updateEntryLine(companyId, id, lineId, body);
  }

  @Delete(':id/entry-lines/:lineId')
  @RequirePermission('batches', 'edit')
  removeEntryLine(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ) {
    return this.batchesService.removeEntryLine(companyId, id, lineId);
  }

  @Delete(':id')
  @RequirePermission('batches', 'delete')
  remove(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.batchesService.remove(companyId, id);
  }
}
