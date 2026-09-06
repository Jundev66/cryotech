import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.schema';
import { LoopbackAwareThrottlerGuard } from './common/guards/throttler.guard';
import { DecimalInterceptor } from './common/interceptors/decimal.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { MembersModule } from './modules/members/members.module';
import { RolesModule } from './modules/roles/roles.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { BatchesModule } from './modules/batches/batches.module';
import { DailyLogsModule } from './modules/daily-logs/daily-logs.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ProductsModule } from './modules/products/products.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { SalesModule } from './modules/sales/sales.module';
import { FeedModule } from './modules/feed/feed.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EntriesModule } from './modules/entries/entries.module';
import { PayablesModule } from './modules/payables/payables.module';
import { ProcessingModule } from './modules/processing/processing.module';
import { ProductConsumptionsModule } from './modules/product-consumptions/product-consumptions.module';
import { ExchangeRatesModule } from './modules/exchange-rates/exchange-rates.module';
import { TreasuryModule } from './modules/treasury/treasury.module';
import { ReceiptOcrModule } from './modules/receipt-ocr/receipt-ocr.module';
import { AssistantModule } from './modules/assistant/assistant.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { MeasurementUnitsModule } from './modules/measurement-units/measurement-units.module';
import { ProductCategoriesModule } from './modules/product-categories/product-categories.module';
import { SequenceModule } from './common/services/sequence.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // A baseline ceiling on every route. It is deliberately loose — the point
    // is to cap automated abuse, not to get in the way of someone filling in a
    // form. `/auth` narrows it further, where guessing actually pays off.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    SequenceModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    MembersModule,
    RolesModule,
    WarehousesModule,
    BatchesModule,
    DailyLogsModule,
    ClientsModule,
    ProductsModule,
    TransactionsModule,
    SalesModule,
    FeedModule,
    ReportsModule,
    DashboardModule,
    EntriesModule,
    PayablesModule,
    ProcessingModule,
    ProductConsumptionsModule,
    ExchangeRatesModule,
    TreasuryModule,
    ReceiptOcrModule,
    AssistantModule,
    WhatsappModule,
    TelegramModule,
    MeasurementUnitsModule,
    ProductCategoriesModule,
  ],
  providers: [
    // Every response, so a Decimal column never reaches the client as a string
    // and `+` on a money field never concatenates again.
    { provide: APP_INTERCEPTOR, useClass: DecimalInterceptor },
    // Global rather than per-controller: a route added tomorrow is covered by
    // default. Opting out has to be deliberate (@SkipThrottle), which is the
    // right way round.
    { provide: APP_GUARD, useClass: LoopbackAwareThrottlerGuard },
  ],
})
export class AppModule {}
