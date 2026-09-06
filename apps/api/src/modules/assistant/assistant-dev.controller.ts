import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ReceiptIntakeService } from './receipt-intake.service';
import { AssistantService } from './assistant.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

/**
 * Schemas live here rather than in shared-types: no client sends these, they
 * exist only so this route is not the one place that skips validation.
 *
 * The base64 ceiling matters — the payload is decoded into a Buffer and handed
 * to sharp, which expands it in memory.
 */
const MAX_IMAGE_BASE64 = 10 * 1024 * 1024; // ~7.5 MB de imagen

const simulateSchema = z.object({
  imageBase64: z.string().min(1, 'Falta imageBase64').max(MAX_IMAGE_BASE64, 'Imagen demasiado grande'),
  from: z.string().max(40).optional(),
});

const confirmSchema = z.object({
  buttonId: z.string().min(1, 'Falta buttonId').max(200),
  from: z.string().max(40).optional(),
});

const textSchema = z.object({
  text: z.string().max(4000).optional(),
  from: z.string().max(40).optional(),
});

/**
 * Development-only entry point into the assistant.
 *
 * Exercises reader, resolution, drafting, confirmation and execution over
 * plain HTTP — no Meta app, no webhook, no phone. This is what makes the
 * pipeline testable before any of the transport exists, which is why it is
 * built before the transport rather than after.
 *
 * Never mounted when NODE_ENV=production (see AssistantModule).
 */
// Guarded like every other controller: it used to take an arbitrary companyId
// from the body with no membership check, which in the test environment meant
// anyone reaching the port could file receipts against any company.
@Controller('assistant')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard)
export class AssistantDevController {
  constructor(
    private readonly intake: ReceiptIntakeService,
    private readonly assistant: AssistantService,
  ) {}

  @Post('simulate')
  async simulate(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(simulateSchema)) body: z.infer<typeof simulateSchema>,
  ) {
    const result = await this.intake.intake({
      companyId,
      channel: 'simulate',
      externalUserId: body.from ?? 'dev',
      image: Buffer.from(body.imageBase64, 'base64'),
    });

    return {
      tier: result.receipt.tier,
      direction: result.receipt.direction,
      fields: result.receipt.fields,
      exchangeRate: result.receipt.exchangeRate,
      exchangeRateStale: result.receipt.exchangeRateStale,
      warnings: result.receipt.warnings,
      missing: result.receipt.missing,
      duplicateOf: result.receipt.duplicateOf,
      draftId: result.draftId,
      reply: result.reply,
    };
  }

  @Post('simulate/confirm')
  async confirm(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(confirmSchema)) body: z.infer<typeof confirmSchema>,
  ) {
    const reply = await this.assistant.handleButton(
      body.buttonId,
      companyId,
      'simulate',
      body.from ?? 'dev',
    );
    return { reply: reply ?? null, ignored: reply === null };
  }

  /** The menu, and any word that opens an operation. */
  @Post('simulate/text')
  async text(
    @CurrentCompanyId() companyId: string,
    @Body(new ZodValidationPipe(textSchema)) body: z.infer<typeof textSchema>,
  ) {
    const reply = await this.assistant.handleText(
      body.text ?? '',
      companyId,
      'simulate',
      body.from ?? 'dev',
    );
    return { reply };
  }
}
