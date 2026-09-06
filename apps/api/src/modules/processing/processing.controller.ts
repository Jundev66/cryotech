import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ProcessingService } from './processing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { processingSchema } from '@cryotech/shared-types';
import type { ProcessingInput } from '@cryotech/shared-types';

@Controller('processing')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class ProcessingController {
  constructor(private readonly processingService: ProcessingService) {}

  @Get()
  @RequirePermission('processing', 'view')
  findAll(
    @CurrentCompanyId() companyId: string,
    @Query('batchId') batchId?: string,
    @Query('search') search?: string,
  ) {
    return this.processingService.findAll(companyId, batchId, search);
  }

  @Post()
  @RequirePermission('processing', 'create')
  create(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(processingSchema)) body: ProcessingInput,
  ) {
    return this.processingService.create(companyId, body);
  }
}
