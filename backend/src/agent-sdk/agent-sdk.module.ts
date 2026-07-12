import { Module } from '@nestjs/common';
import { AgentSdkService } from './agent-sdk.service';
import { AgentSdkController } from './agent-sdk.controller';

@Module({
  controllers: [AgentSdkController],
  providers: [AgentSdkService],
  exports: [AgentSdkService],
})
export class AgentSdkModule {}
