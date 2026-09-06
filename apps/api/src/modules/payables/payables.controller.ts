import { Controller, Get, Post, Param, Body, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { PayablesService } from './payables.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { payablePaymentSchema, payableKindSchema } from '@cryotech/shared-types';
import type { PayablePaymentInput } from '@cryotech/shared-types';
import type { PayableKind } from './payables.types';

@Controller('payables')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionGuard)
export class PayablesController {
  constructor(private readonly payables: PayablesService) {}

  /** What the business owes right now, purchases and processings together. */
  @Get()
  @RequirePermission('entries', 'view')
  listOpen(@CurrentCompanyId() companyId: string, @Query('kind') kind?: string) {
    return this.payables.listOpen(companyId, {
      kind: kind ? parseKind(kind) : undefined,
    });
  }

  /** Payables whose balance matches an amount — what a receipt looks up. */
  @Get('match')
  @RequirePermission('entries', 'view')
  findByAmount(@CurrentCompanyId() companyId: string, @Query('amount') amount: string) {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('Monto inválido');
    }
    return this.payables.findByAmount(companyId, parsed);
  }

  @Get(':kind/:id')
  @RequirePermission('entries', 'view')
  findOne(
    @CurrentCompanyId() companyId: string,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.payables.findOne(companyId, parseKind(kind), id);
  }

  @Get(':kind/:id/payments')
  @RequirePermission('entries', 'view')
  getPayments(
    @CurrentCompanyId() companyId: string,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.payables.getPayments(companyId, parseKind(kind), id);
  }

  /** Paying moves cash only — the operation already recognised the expense. */
  @Post(':kind/:id/payments')
  @RequirePermission('entries', 'edit')
  registerPayment(
    @CurrentCompanyId() companyId: string,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(payablePaymentSchema)) body: PayablePaymentInput,
  ) {
    return this.payables.registerPayment(companyId, {
      ...body,
      kind: parseKind(kind),
      payableId: id,
    });
  }
}

function parseKind(value: string): PayableKind {
  const parsed = payableKindSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException(`Tipo de pagable inválido: "${value}"`);
  }
  return parsed.data;
}
