import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { TreasuryModule } from '../treasury/treasury.module';

@Module({
  imports: [ExchangeRatesModule, TreasuryModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
