import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { TreasuryModule } from '../treasury/treasury.module';

@Module({
  // ExchangeRates so a payment can resolve its own rate instead of storing
  // dollars in a bolivar column; Treasury so the cash side is booked in the
  // same transaction as the payment.
  imports: [ExchangeRatesModule, TreasuryModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
