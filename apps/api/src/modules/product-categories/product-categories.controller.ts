import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ProductCategoriesService } from './product-categories.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { productCategorySchema, type ProductCategoryInput } from '@cryotech/shared-types';

@Controller('product-categories')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class ProductCategoriesController {
  constructor(private readonly service: ProductCategoriesService) {}

  @Get()
  @RequirePermission('settings', 'view')
  findAll(@CurrentCompanyId() companyId: string) {
    return this.service.findAll(companyId);
  }

  @Post()
  @RequirePermission('settings', 'edit')
  create(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(productCategorySchema)) body: ProductCategoryInput,
  ) {
    return this.service.create(companyId, body);
  }

  @Patch(':id')
  @RequirePermission('settings', 'edit')
  update(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productCategorySchema.partial())) body: Partial<ProductCategoryInput>,
  ) {
    return this.service.update(companyId, id, body);
  }

  @Delete(':id')
  @RequirePermission('settings', 'edit')
  remove(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.service.remove(companyId, id);
  }
}
