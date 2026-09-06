import { Module } from '@nestjs/common';
import { PayablesController } from './payables.controller';
import { PayablesService } from './payables.service';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { TreasuryModule } from '../treasury/treasury.module';

@Module({
  // ExchangeRates so a payment made in dollars converts itself; Treasury so
  // paying actually moves money out of an account.
  imports: [ExchangeRatesModule, TreasuryModule],
  controllers: [PayablesController],
  providers: [PayablesService],
  exports: [PayablesService],
})
export class PayablesModule {}
