import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { companySchema, type CompanyInput } from '@cryotech/shared-types';

@Controller('companies')
@UseGuards(JwtAuthGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(companySchema)) body: { name: string; phone?: string; address?: string }) {
    return this.companiesService.create(userId, body);
  }

  @Get()
  findAll(@CurrentUser('id') userId: string) {
    return this.companiesService.findAllForUser(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.companiesService.findOne(id, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body(new ZodValidationPipe(companySchema.partial())) body: Partial<CompanyInput>) {
    return this.companiesService.update(id, userId, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.companiesService.remove(id, userId);
  }
}
