import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DemoService } from './demo.service';

const FIFTEEN_MINUTES = 15 * 60_000;

@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  /**
   * Genera un entorno de demostración efímero y entrega credenciales JWT
   * con expiración automática de 2 horas.
   *
   * Rate limiting: máximo 10 solicitudes por IP cada 15 minutos.
   */
  @Post()
  @Throttle({ default: { ttl: FIFTEEN_MINUTES, limit: 10 } })
  createDemoSession(@Body() body?: { email?: string; fullName?: string }) {
    return this.demoService.createDemoSession(body);
  }
}
