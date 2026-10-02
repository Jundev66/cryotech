import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to database');
    } catch (err: unknown) {
      this.logger.warn(
        'Initial database connection failed (will retry on query): ' + (err as Error)?.message,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
