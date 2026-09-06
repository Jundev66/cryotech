import { Controller, Get, Put, Body, Query, UseGuards } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { exchangeRateConfigSchema, type ExchangeRateConfigInput } from '@cryotech/shared-types';

@Controller('exchange-rates')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class ExchangeRatesController {
  constructor(private readonly exchangeRatesService: ExchangeRatesService) {}

  @Get('current')
  getCurrentRate(@CurrentCompanyId() companyId: string) {
    return this.exchangeRatesService.getCurrentRate(companyId);
  }

  @Get('config')
  getConfig(@CurrentCompanyId() companyId: string) {
    return this.exchangeRatesService.getConfig(companyId);
  }

  /**
   * Gated on `settings.edit`, not just membership.
   *
   * This number values every bolivar figure in the ledger — prices, payments,
   * balances. It used to be writable by any member of the company, including a
   * shed worker whose role grants nothing but daily logs.
   */
  @Put('config')
  @RequirePermission('settings', 'edit')
  updateConfig(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(exchangeRateConfigSchema)) body: ExchangeRateConfigInput,
  ) {
    return this.exchangeRatesService.updateConfig(companyId, body);
  }

  @Get('history')
  getRateHistory(@Query('days') days?: string) {
    const numDays = days ? parseInt(days, 10) : 30;
    return this.exchangeRatesService.getRateHistory(numDays);
  }
}
