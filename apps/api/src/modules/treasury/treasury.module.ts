import { Module } from '@nestjs/common';
import { TreasuryController } from './treasury.controller';
import { AccountsService } from './accounts.service';
import { MovementsService } from './movements.service';

@Module({
  controllers: [TreasuryController],
  providers: [AccountsService, MovementsService],
  exports: [AccountsService, MovementsService],
})
export class TreasuryModule {}
