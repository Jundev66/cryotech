import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { MeasurementUnitsModule } from '../measurement-units/measurement-units.module';
import { ProductCategoriesModule } from '../product-categories/product-categories.module';

@Module({
  imports: [MeasurementUnitsModule, ProductCategoriesModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
