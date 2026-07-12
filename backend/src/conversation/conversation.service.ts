import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly msgRepo: Repository<Message>,
  ) {}

  /** Create a new conversation with the first user message. */
  async create(firstMessage: string): Promise<Conversation> {
    const conv = this.convRepo.create({
      title: firstMessage.slice(0, 50) || '新对话',
    });
    const saved = await this.convRepo.save(conv);

    // Save the first user message
    const msg = this.msgRepo.create({
      role: 'user',
      content: firstMessage,
      conversationId: saved.id,
    });
    await this.msgRepo.save(msg);

    return this.convRepo.findOne({ where: { id: saved.id }, relations: ['messages'] }) as Promise<Conversation>;
  }

  /** Find a conversation by ID with its messages. */
  async findOne(id: string): Promise<Conversation> {
    const conv = await this.convRepo.findOne({
      where: { id },
      relations: ['messages'],
      order: { messages: { createdAt: 'ASC' } },
    });
    if (!conv) throw new NotFoundException(`Conversation ${id} not found`);
    return conv;
  }

  /** List all conversations (without full messages). */
  async findAll(): Promise<Conversation[]> {
    return this.convRepo.find({
      order: { updatedAt: 'DESC' },
    });
  }

  /** Add a message to a conversation. Returns the saved message. */
  async addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    thinkingChain?: string,
  ): Promise<Message> {
    const msg = this.msgRepo.create({
      role,
      content,
      thinkingChain,
      conversationId,
    });
    const saved = await this.msgRepo.save(msg);

    // Update conversation timestamp
    await this.convRepo.update(conversationId, { updatedAt: new Date() });

    return saved;
  }

  /** Update an existing message (e.g., after streaming completes). */
  async updateMessage(
    messageId: string,
    content: string,
    thinkingChain?: string,
  ): Promise<void> {
    await this.msgRepo.update(messageId, { content, thinkingChain });
  }

  /** Get messages for a conversation. */
  async getMessages(conversationId: string): Promise<Message[]> {
    return this.msgRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }
}
