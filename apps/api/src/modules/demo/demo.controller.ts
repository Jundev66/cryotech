import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { DemoService } from './demo.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createDemoLeadSchema,
  updateDemoLeadStatusSchema,
  type CreateDemoLeadInput,
  type UpdateDemoLeadStatusInput,
} from '@cryotech/shared-types';

const FIFTEEN_MINUTES = 15 * 60_000;

function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '';
}

@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  /**
   * Genera un entorno de demostracion efimero y entrega credenciales JWT
   * con expiracion automatica de 2 horas.
   * Si incluye datos de contacto (telefono), captura automaticamente el lead.
   */
  @Post()
  @Throttle({ default: { ttl: FIFTEEN_MINUTES, limit: 10 } })
  createDemoSession(
    @Body() body?: { email?: string; fullName?: string; phone?: string; farmSize?: string; source?: string },
    @Req() req?: Request,
  ) {
    if (body?.phone && body?.fullName) {
      const clientIp = req ? extractClientIp(req) : '';
      return this.demoService.captureLeadAndCreateSession(
        {
          fullName: body.fullName,
          phone: body.phone,
          email: body.email || '',
          farmSize: body.farmSize || '',
          source: (body.source as any) || 'erp_landing',
        },
        clientIp,
      );
    }
    return this.demoService.createDemoSession(body);
  }

  /**
   * Endpoint oficial de captura de prospectos (leads) interesados en la demo.
   * Valida datos estrictamente con Zod, persiste el prospecto y aprovisiona
   * la sesion de prueba en una sola transaccion sin friccion.
   */
  @Post('leads')
  @Throttle({ default: { ttl: FIFTEEN_MINUTES, limit: 10 } })
  @UsePipes(new ZodValidationPipe(createDemoLeadSchema))
  captureLead(
    @Body() body: CreateDemoLeadInput,
    @Req() req: Request,
  ) {
    const clientIp = extractClientIp(req);
    return this.demoService.captureLeadAndCreateSession(body, clientIp);
  }

  /**
   * Bandeja de administracion interna para consultar los leads capturados.
   * Protegido por JWT.
   */
  @Get('leads')
  @UseGuards(JwtAuthGuard)
  listLeads(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('source') source?: string,
  ) {
    return this.demoService.listLeads({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
      source,
    });
  }

  /**
   * Actualiza el estado o notas de un prospecto (por ejemplo: contactado por WhatsApp).
   */
  @Patch('leads/:id/status')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(updateDemoLeadStatusSchema))
  updateLeadStatus(
    @Param('id') id: string,
    @Body() body: UpdateDemoLeadStatusInput,
  ) {
    return this.demoService.updateLeadStatus(id, body.status, body.notes);
  }
}
