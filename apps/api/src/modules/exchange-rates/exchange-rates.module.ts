import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ExchangeRatesController } from './exchange-rates.controller';
import { ExchangeRatesService } from './exchange-rates.service';
import { ExchangeRatesScheduler } from './exchange-rates.scheduler';
import { BcvScraperProvider } from './providers/bcv-scraper.provider';

@Module({
  imports: [HttpModule],
  controllers: [ExchangeRatesController],
  providers: [ExchangeRatesService, ExchangeRatesScheduler, BcvScraperProvider],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
