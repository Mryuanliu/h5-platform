import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [ConversationModule],
  controllers: [AdminController],
})
export class AdminModule {}
