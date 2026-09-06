import { Module } from '@nestjs/common';
import { MeasurementUnitsController } from './measurement-units.controller';
import { MeasurementUnitsService } from './measurement-units.service';

@Module({
  controllers: [MeasurementUnitsController],
  providers: [MeasurementUnitsService],
  exports: [MeasurementUnitsService],
})
export class MeasurementUnitsModule {}
