import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { DeepseekService } from './deepseek.service';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [ConversationModule],
  controllers: [ChatController],
  providers: [ChatService, DeepseekService],
})
export class ChatModule {}
