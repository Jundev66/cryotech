import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AssistantService } from './assistant.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../../common/guards/company-membership.guard';
import { CurrentCompanyId } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const mobileMessageSchema = z.object({
  text: z.string().min(1, 'El mensaje es requerido').max(2000),
});

export type MobileMessageInput = z.infer<typeof mobileMessageSchema>;

@Controller('assistant/mobile')
@UseGuards(JwtAuthGuard, CompanyMembershipGuard)
export class AssistantMobileController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('message')
  async handleMessage(
    @CurrentCompanyId() companyId: string,
    @CurrentUser() user: { id: string },
    @Body(new ZodValidationPipe(mobileMessageSchema)) body: MobileMessageInput,
  ) {
    const reply = await this.assistant.handleText(
      body.text,
      companyId,
      'mobile',
      user.id,
    );
    return {
      message: reply.text,
      buttons: reply.buttons ?? [],
    };
  }
}
