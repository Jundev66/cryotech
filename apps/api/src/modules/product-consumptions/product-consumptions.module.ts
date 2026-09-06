import { Module } from '@nestjs/common';
import { ProductConsumptionsController } from './product-consumptions.controller';
import { ProductConsumptionsService } from './product-consumptions.service';

@Module({
  controllers: [ProductConsumptionsController],
  providers: [ProductConsumptionsService],
  exports: [ProductConsumptionsService],
})
export class ProductConsumptionsModule {}
