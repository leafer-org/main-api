import { Module } from '@nestjs/common';

import { DrizzleChatOrganizationMembershipReadModel } from './adapters/db/queries/organization-membership.read-model.js';
import { OrganizationMembershipProjectionHandler } from './adapters/kafka/organization-membership-projection.handler.js';
import { ChatStreamingBridgeHandler } from './adapters/realtime/chat-streaming-bridge.handler.js';
import { DrizzleChatQuery } from './adapters/db/queries/chat.query.js';
import { DrizzleChatSearchQuery } from './adapters/db/queries/chat-search.query.js';
import { DrizzleChatRepository } from './adapters/db/repositories/chat.repository.js';
import { DrizzleMessageRepository } from './adapters/db/repositories/message.repository.js';
import { AdminChatsController } from './adapters/http/admin-chats.controller.js';
import { CentrifugoController } from './adapters/http/centrifugo.controller.js';
import { ChatsController } from './adapters/http/chats.controller.js';
import { UuidChatIdGenerator } from './adapters/id-generator.js';
import { OutboxChatEventPublisher } from './adapters/publishers/outbox-publisher.js';
import { DefaultSlotPoolResolver } from './adapters/services/slot-pool.resolver.js';
import {
  ChatDetailQueryPort,
  ChatEventPublisher,
  ChatIdGenerator,
  ChatListQueryPort,
  ChatMessagesQueryPort,
  ChatOrganizationMembershipReadModel,
  ChatRepository,
  ChatSearchQueryPort,
  MessageRepository,
  SlotPoolResolver,
  UnreadSummaryQueryPort,
} from './application/ports.js';
import {
  BlockChatInteractor,
  CloseChatInteractor,
  UnblockChatInteractor,
} from './application/use-cases/block-chat.interactor.js';
import { ClaimSlotInteractor } from './application/use-cases/claim-slot.interactor.js';
import { DeleteMessageInteractor } from './application/use-cases/delete-message.interactor.js';
import { EditMessageInteractor } from './application/use-cases/edit-message.interactor.js';
import { MarkReadInteractor } from './application/use-cases/mark-read.interactor.js';
import { OpenChatAsSupportInteractor } from './application/use-cases/open-chat-as-support.interactor.js';
import { OpenChatWithOrganizationInteractor } from './application/use-cases/open-chat-with-organization.interactor.js';
import { OpenChatWithSupportInteractor } from './application/use-cases/open-chat-with-support.interactor.js';
import { ReassignSlotInteractor } from './application/use-cases/reassign-slot.interactor.js';
import { ReleaseSlotInteractor } from './application/use-cases/release-slot.interactor.js';
import {
  SearchChatsAsOperatorInteractor,
  SearchChatsAsUserInteractor,
} from './application/use-cases/search-chats.interactor.js';
import {
  ReportChatInteractor,
  ReportMessageInteractor,
} from './application/use-cases/report-message.interactor.js';
import { SendMessageAsOperatorInteractor } from './application/use-cases/send-message-as-operator.interactor.js';
import { SendMessageAsUserInteractor } from './application/use-cases/send-message-as-user.interactor.js';
import { Clock, SystemClock } from '@/infra/lib/clock.js';

@Module({
  controllers: [CentrifugoController, ChatsController, AdminChatsController],
  providers: [
    { provide: Clock, useClass: SystemClock },

    // Write-side
    { provide: ChatRepository, useClass: DrizzleChatRepository },
    { provide: MessageRepository, useClass: DrizzleMessageRepository },

    // Read-side queries (одна реализация удовлетворяет нескольким портам)
    DrizzleChatQuery,
    { provide: ChatListQueryPort, useExisting: DrizzleChatQuery },
    { provide: ChatDetailQueryPort, useExisting: DrizzleChatQuery },
    { provide: ChatMessagesQueryPort, useExisting: DrizzleChatQuery },
    { provide: UnreadSummaryQueryPort, useExisting: DrizzleChatQuery },
    { provide: ChatSearchQueryPort, useClass: DrizzleChatSearchQuery },

    // Services
    { provide: ChatIdGenerator, useClass: UuidChatIdGenerator },
    { provide: ChatEventPublisher, useClass: OutboxChatEventPublisher },
    { provide: SlotPoolResolver, useClass: DefaultSlotPoolResolver },
    {
      provide: ChatOrganizationMembershipReadModel,
      useClass: DrizzleChatOrganizationMembershipReadModel,
    },

    // Kafka handlers
    OrganizationMembershipProjectionHandler,
    ChatStreamingBridgeHandler,

    // Use cases
    OpenChatWithOrganizationInteractor,
    OpenChatWithSupportInteractor,
    OpenChatAsSupportInteractor,
    SendMessageAsUserInteractor,
    SendMessageAsOperatorInteractor,
    ClaimSlotInteractor,
    ReleaseSlotInteractor,
    ReassignSlotInteractor,
    BlockChatInteractor,
    UnblockChatInteractor,
    CloseChatInteractor,
    MarkReadInteractor,
    EditMessageInteractor,
    DeleteMessageInteractor,
    ReportMessageInteractor,
    ReportChatInteractor,
    SearchChatsAsUserInteractor,
    SearchChatsAsOperatorInteractor,
  ],
})
export class ChatModule {}
