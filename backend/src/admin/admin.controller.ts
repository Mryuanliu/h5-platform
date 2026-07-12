import { Controller, Get, Param, Delete, Query } from '@nestjs/common';
import { ConversationService } from '../conversation/conversation.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly conversation: ConversationService) {}

  /** 对话列表（含消息数） */
  @Get('conversations')
  async listConversations(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.conversation.adminListConversations(page ?? 1, limit ?? 50);
  }

  /** 消息列表 */
  @Get('messages')
  async listMessages(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.conversation.adminListMessages(page ?? 1, limit ?? 100);
  }

  /** 单条消息详情 */
  @Get('messages/:id')
  async getMessage(@Param('id') id: string) {
    return this.conversation.adminGetMessage(id);
  }

  /** 删除对话 */
  @Delete('conversations/:id')
  async deleteConversation(@Param('id') id: string) {
    await this.conversation.delete(id);
    return { deleted: true };
  }
}
