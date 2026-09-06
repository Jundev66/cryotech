import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ProductConsumptionsService } from './product-consumptions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { productConsumptionSchema } from '@cryotech/shared-types';
import type { ProductConsumptionInput } from '@cryotech/shared-types';

@Controller('product-consumptions')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class ProductConsumptionsController {
  constructor(private readonly productConsumptionsService: ProductConsumptionsService) {}

  @Get()
  @RequirePermission('products', 'view')
  findAll(
    @CurrentCompanyId() companyId: string,
    @Query('batchId') batchId?: string,
    @Query('productId') productId?: string,
  ) {
    return this.productConsumptionsService.findAll(companyId, { batchId, productId });
  }

  @Post()
  @RequirePermission('products', 'create')
  create(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(productConsumptionSchema)) body: ProductConsumptionInput,
  ) {
    return this.productConsumptionsService.create(companyId, body);
  }

  @Delete(':id')
  @RequirePermission('products', 'delete')
  remove(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.productConsumptionsService.remove(companyId, id);
  }
}
