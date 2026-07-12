import { Module } from '@nestjs/common';
import { AgentSdkService } from './agent-sdk.service';
import { AgentSdkController } from './agent-sdk.controller';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [ConversationModule],
  controllers: [AgentSdkController],
  providers: [AgentSdkService],
  exports: [AgentSdkService],
})
export class AgentSdkModule {}
