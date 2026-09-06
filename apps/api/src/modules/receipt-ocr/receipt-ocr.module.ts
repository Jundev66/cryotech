import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ReceiptReaderService } from './receipt-reader.service';

@Module({
  imports: [AiModule],
  providers: [ReceiptReaderService],
  exports: [ReceiptReaderService],
})
export class ReceiptOcrModule {}
