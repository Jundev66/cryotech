import { Module } from '@nestjs/common';
import { ProcessingController } from './processing.controller';
import { ProcessingService } from './processing.service';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';

@Module({
  // ExchangeRates so a cost given in dollars gets its bolivar figure, which is
  // what the books and the payable balance are denominated in.
  imports: [ExchangeRatesModule],
  controllers: [ProcessingController],
  providers: [ProcessingService],
  exports: [ProcessingService],
})
export class ProcessingModule {}
