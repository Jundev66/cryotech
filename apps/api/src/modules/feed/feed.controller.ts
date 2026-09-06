import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { FeedService } from './feed.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ConsumptionStatus } from '@prisma/client';
import { parseEnum } from '../../common/parse-enum.util';
import {
  feedFormulaSchema,
  feedPhaseConfigSchema,
  feedConsumptionSchema,
  feedConsumptionAdjustSchema,
  type FeedFormulaInput,
  type FeedPhaseConfigInput,
  type FeedConsumptionInput,
  type FeedConsumptionAdjustInput,
} from '@cryotech/shared-types';

@Controller('feed')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  // --- Feed Formula endpoints ---

  @Get('formulas')
  @RequirePermission('batches', 'view')
  findAllFormulas(@CurrentCompanyId() companyId: string) {
    return this.feedService.findAllFormulas(companyId);
  }

  @Get('formulas/:id')
  @RequirePermission('batches', 'view')
  findOneFormula(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.feedService.findOneFormula(companyId, id);
  }

  @Post('formulas')
  @RequirePermission('batches', 'create')
  createFormula(@CurrentCompanyId() companyId: string, @Body(new ZodValidationPipe(feedFormulaSchema)) body: FeedFormulaInput) {
    return this.feedService.createFormula(companyId, body);
  }

  @Patch('formulas/:id')
  @RequirePermission('batches', 'edit')
  updateFormula(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(feedFormulaSchema.partial())) body: Partial<FeedFormulaInput>,
  ) {
    return this.feedService.updateFormula(companyId, id, body);
  }

  @Delete('formulas/:id')
  @RequirePermission('batches', 'delete')
  removeFormula(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.feedService.removeFormula(companyId, id);
  }

  // --- Feed Consumption endpoints ---

  @Get('consumptions')
  @RequirePermission('batches', 'view')
  findAllConsumptions(
    @CurrentCompanyId() companyId: string,
    @Query('batchId') batchId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.feedService.findAllConsumptions(companyId, {
      batchId,
      status: parseEnum(ConsumptionStatus, status, 'status'),
      search,
    });
  }

  @Post('consumptions')
  @RequirePermission('batches', 'create')
  createConsumption(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(feedConsumptionSchema)) body: FeedConsumptionInput,
  ) {
    return this.feedService.createConsumption(companyId, body);
  }

  @Patch('consumptions/:id')
  @RequirePermission('batches', 'edit')
  updateConsumption(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(feedConsumptionSchema.partial())) body: Partial<FeedConsumptionInput>,
  ) {
    return this.feedService.updateConsumption(companyId, id, body);
  }

  @Patch('consumptions/:id/approve')
  @RequirePermission('batches', 'edit')
  approveConsumption(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.feedService.approveConsumption(companyId, id);
  }

  @Patch('consumptions/:id/adjust')
  @RequirePermission('batches', 'edit')
  adjustConsumption(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(feedConsumptionAdjustSchema)) body: FeedConsumptionAdjustInput,
  ) {
    return this.feedService.adjustConsumption(companyId, id, body.adjustedQuantityKg);
  }

  @Delete('consumptions/:id/reject')
  @RequirePermission('batches', 'edit')
  rejectConsumption(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.feedService.rejectConsumption(companyId, id);
  }

  @Post('auto-generate')
  @RequirePermission('batches', 'create')
  autoGenerateAll(@CurrentCompanyId() companyId: string) {
    return this.feedService.autoGenerateForCompany(companyId);
  }

  @Post('auto-generate/:batchId')
  @RequirePermission('batches', 'create')
  autoGenerateForBatch(@CurrentCompanyId() companyId: string, @Param('batchId') batchId: string) {
    return this.feedService.autoGenerateForBatch(companyId, batchId);
  }

  // --- Feed Phase Config endpoints ---

  @Get('phase-configs')
  @RequirePermission('batches', 'view')
  findAllPhaseConfigs(@CurrentCompanyId() companyId: string) {
    return this.feedService.findAllPhaseConfigs(companyId);
  }

  @Post('phase-configs')
  @RequirePermission('batches', 'create')
  createPhaseConfig(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(feedPhaseConfigSchema)) body: FeedPhaseConfigInput,
  ) {
    return this.feedService.createPhaseConfig(companyId, body);
  }

  @Patch('phase-configs/:id')
  @RequirePermission('batches', 'edit')
  updatePhaseConfig(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(feedPhaseConfigSchema.partial())) body: Partial<FeedPhaseConfigInput>,
  ) {
    return this.feedService.updatePhaseConfig(companyId, id, body);
  }
}
