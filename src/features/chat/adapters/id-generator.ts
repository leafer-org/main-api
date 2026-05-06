import { Injectable } from '@nestjs/common';

import { ChatIdGenerator } from '../application/ports.js';
import { ChatId, ChatMessageId, ChatParticipantId } from '@/kernel/domain/ids.js';

@Injectable()
export class UuidChatIdGenerator extends ChatIdGenerator {
  public generateChatId(): ChatId {
    return ChatId.raw(crypto.randomUUID());
  }

  public generateParticipantId(): ChatParticipantId {
    return ChatParticipantId.raw(crypto.randomUUID());
  }

  public generateMessageId(): ChatMessageId {
    return ChatMessageId.raw(crypto.randomUUID());
  }
}
