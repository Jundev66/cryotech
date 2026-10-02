import { Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DemoService } from './demo.service';

const FIFTEEN_MINUTES = 15 * 60_000;

@Controller('auth/demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  /**
   * Genera un entorno de demostración efímero y entrega credenciales JWT
   * con expiración automática de 2 horas.
   *
   * Rate limiting: máximo 5 solicitudes por IP cada 15 minutos.
   */
  @Post()
  @Throttle({ default: { ttl: FIFTEEN_MINUTES, limit: 5 } })
  createDemoSession() {
    return this.demoService.createDemoSession();
  }
}
