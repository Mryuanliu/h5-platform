import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Message } from '../conversation/entities/message.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: './data/h5-platform.db',
      entities: [Conversation, Message],
      synchronize: true, // auto-create tables (dev only)
    }),
  ],
})
export class DatabaseModule {}
