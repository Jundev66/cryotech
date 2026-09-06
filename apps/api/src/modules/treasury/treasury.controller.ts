import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { MovementsService } from './movements.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  accountSchema,
  accountUpdateSchema,
  accountMovementSchema,
  internalTransferSchema,
  fxTradeSchema,
} from '@cryotech/shared-types';
import type {
  AccountInput,
  AccountUpdateInput,
  AccountMovementInput,
  InternalTransferInput,
  FxTradeInput,
} from '@cryotech/shared-types';

@Controller('treasury')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class TreasuryController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly movements: MovementsService,
  ) {}

  // --- Accounts ---

  @Get('accounts')
  @RequirePermission('treasury', 'view')
  listAccounts(
    @CurrentCompanyId() companyId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.accounts.findAll(companyId, includeInactive === 'true');
  }

  @Get('accounts/:id')
  @RequirePermission('treasury', 'view')
  getAccount(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.accounts.findOne(companyId, id);
  }

  @Post('accounts')
  @RequirePermission('treasury', 'create')
  createAccount(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(accountSchema)) body: AccountInput,
  ) {
    return this.accounts.create(companyId, body);
  }

  @Patch('accounts/:id')
  @RequirePermission('treasury', 'edit')
  updateAccount(
    @CurrentCompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(accountUpdateSchema)) body: AccountUpdateInput,
  ) {
    return this.accounts.update(companyId, id, body);
  }

  @Delete('accounts/:id')
  @RequirePermission('treasury', 'delete')
  removeAccount(@CurrentCompanyId() companyId: string, @Param('id') id: string) {
    return this.accounts.remove(companyId, id);
  }

  // --- Movements ---

  @Get('movements')
  @RequirePermission('treasury', 'view')
  listMovements(
    @CurrentCompanyId() companyId: string,
    @Query('accountId') accountId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.movements.findAll(companyId, {
      accountId,
      startDate,
      endDate,
      limit: limit ? Number(limit) : undefined,
      search,
    });
  }

  @Post('movements')
  @RequirePermission('treasury', 'create')
  createMovement(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(accountMovementSchema)) body: AccountMovementInput,
  ) {
    return this.movements.createManual(companyId, body);
  }

  @Post('transfers')
  @RequirePermission('treasury', 'create')
  createTransfer(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(internalTransferSchema)) body: InternalTransferInput,
  ) {
    return this.movements.recordTransfer(companyId, body);
  }

  @Post('fx-trades')
  @RequirePermission('treasury', 'create')
  createFxTrade(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(fxTradeSchema)) body: FxTradeInput,
  ) {
    return this.movements.recordFxTrade(companyId, body);
  }

  /**
   * Compares every stored balance against the sum of its movements. Read-only
   * by default; pass `?apply=true` to write the recomputed values.
   */
  @Post('reconcile')
  @RequirePermission('treasury', 'edit')
  reconcile(@CurrentCompanyId() companyId: string, @Query('apply') apply?: string) {
    return this.movements.recomputeBalances(companyId, apply === 'true');
  }
}
