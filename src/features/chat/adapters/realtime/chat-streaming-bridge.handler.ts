import { Inject, Injectable } from '@nestjs/common';

import { CHAT_CONSUMER_ID } from '../kafka/consumer-ids.js';
import { ChatRepository } from '../../application/ports.js';
import { CentrifugoApiClient } from '@/infra/centrifugo/centrifugo-api.client.js';
import { chatStreamingContract } from '@/infra/kafka-contracts/chat.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import { ChatId } from '@/kernel/domain/ids.js';

/**
 * Бридж Kafka `chat.streaming` → Centrifugo.
 *
 * Каждое доменное событие пушится сразу в несколько каналов:
 *   - chat:{chatId} (всегда)
 *   - inbox:user:{userId} / inbox:org:{orgId} / inbox:support — выводятся
 *     из participants чата.
 *
 * Подписки в каналах chat:* приоритетно используются для активных диалогов;
 * inbox:* — для апдейтов списков (preview / status / new chat appears).
 *
 * Для inbox-каналов нужен снимок participants — берём из ChatRepository
 * (актуальное состояние). Это eventually consistent относительно события.
 */
@KafkaConsumerHandlers(CHAT_CONSUMER_ID)
@Injectable()
export class ChatStreamingBridgeHandler {
  public constructor(
    @Inject(CentrifugoApiClient) private readonly centrifugo: CentrifugoApiClient,
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
  ) {}

  @ContractHandler(chatStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof chatStreamingContract>,
  ): Promise<void> {
    const event = message.value;
    const chatId = ChatId.raw(event.chatId);

    const channels = await this.routeChannels(chatId);
    const payload = { type: event.type, payload: event };

    await this.centrifugo.broadcast(channels, payload);
  }

  private async routeChannels(chatId: ChatId): Promise<string[]> {
    const channels: string[] = [`chat:${chatId as string}`];

    const chat = await this.chatRepo.findById(NO_TRANSACTION, chatId);
    if (!chat) return channels;

    for (const p of chat.participants) {
      if (p.kind === 'user' && p.subjectId !== null) {
        channels.push(`inbox:user:${p.subjectId}`);
      } else if (p.kind === 'organization' && p.subjectId !== null) {
        channels.push(`inbox:org:${p.subjectId}`);
      } else if (p.kind === 'support') {
        channels.push('inbox:support');
      }
    }

    return channels;
  }
}
