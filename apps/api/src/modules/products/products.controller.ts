import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { productSchema, type ProductInput } from '@cryotech/shared-types';

@Controller('products')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @RequirePermission('products', 'view')
  findAll(@CurrentCompanyId() companyId: string, @Query('search') search?: string) {
    return this.productsService.findAll(companyId, { search });
  }

  @Get('low-stock')
  @RequirePermission('products', 'view')
  getLowStockAlerts(@CurrentCompanyId() companyId: string) {
    return this.productsService.getLowStockAlerts(companyId);
  }

  @Get(':id')
  @RequirePermission('products', 'view')
  findOne(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.productsService.findOne(companyId, id);
  }

  @Post()
  @RequirePermission('products', 'create')
  create(@CurrentCompanyId() companyId: string, @Body(new ZodValidationPipe(productSchema)) body: ProductInput) {
    return this.productsService.create(companyId, body);
  }

  @Patch(':id')
  @RequirePermission('products', 'edit')
  update(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productSchema.partial())) body: Partial<ProductInput>,
  ) {
    return this.productsService.update(companyId, id, body);
  }

  @Delete(':id')
  @RequirePermission('products', 'delete')
  remove(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.productsService.remove(companyId, id);
  }
}
