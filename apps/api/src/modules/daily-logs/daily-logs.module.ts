import { Module } from '@nestjs/common';
import { DailyLogsController } from './daily-logs.controller';
import { DailyLogsService } from './daily-logs.service';

@Module({
  controllers: [DailyLogsController],
  providers: [DailyLogsService],
  exports: [DailyLogsService],
})
export class DailyLogsModule {}
