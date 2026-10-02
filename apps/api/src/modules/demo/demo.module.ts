import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { DemoSweeperService } from './demo-sweeper.service';
import { DemoQuotaGuard } from './demo-quota.guard';
import { MeasurementUnitsModule } from '../measurement-units/measurement-units.module';
import { ProductCategoriesModule } from '../product-categories/product-categories.module';

@Module({
  imports: [
    MeasurementUnitsModule,
    ProductCategoriesModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get('JWT_ACCESS_EXPIRATION', '2h') },
      }),
    }),
  ],
  controllers: [DemoController],
  providers: [DemoService, DemoSweeperService, DemoQuotaGuard],
  exports: [DemoService, DemoQuotaGuard],
})
export class DemoModule {}
