import { Inject, Injectable } from '@nestjs/common';

import type { MessageAttachment } from '../../domain/vo/message-attachment.js';
import { ChatEntity } from '../../domain/aggregates/chat/entity.js';
import {
  ChatBlockedError,
  type ClaimRequiredError,
  type EmptyMessageError,
  type ForbiddenPairError,
  type InvalidParticipantsError,
  type MessageTextTooLongError,
  type MessageTooManyMediaError,
  type OrganizationCannotInitiateError,
  SenderNotInChatError,
} from '../../domain/aggregates/chat/errors.js';
import { MessageEntity } from '../../domain/aggregates/message/entity.js';
import { OrganizationNotFoundForChatError } from '../errors.js';
import { pairKeyOf } from '../pair-key.js';
import {
  ChatEventPublisher,
  ChatIdGenerator,
  ChatRepository,
  MessageRepository,
} from '../ports.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { OrganizationRespondabilityPort } from '@/kernel/application/ports/organization-respondability.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ChatId, MediaId, OrganizationId, UserId } from '@/kernel/domain/ids.js';

export type OpenChatWithOrganizationCommand = {
  initiatorUserId: UserId;
  organizationId: OrganizationId;
  message: {
    text: string | null;
    mediaIds: readonly MediaId[];
    attachments: readonly MessageAttachment[];
  };
};

export type OpenChatResult = {
  chatId: ChatId;
  reused: boolean;
};

type OpenError =
  | OrganizationNotFoundForChatError
  | EmptyMessageError
  | MessageTextTooLongError
  | MessageTooManyMediaError
  | InvalidParticipantsError
  | ForbiddenPairError
  | OrganizationCannotInitiateError
  | SenderNotInChatError
  | ChatBlockedError
  | ClaimRequiredError;

@Injectable()
export class OpenChatWithOrganizationInteractor {
  public constructor(
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
    @Inject(MessageRepository) private readonly messageRepo: MessageRepository,
    @Inject(ChatIdGenerator) private readonly idGen: ChatIdGenerator,
    @Inject(OrganizationRespondabilityPort)
    private readonly respondability: OrganizationRespondabilityPort,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ChatEventPublisher) private readonly publisher: ChatEventPublisher,
  ) {}

  public async execute(
    cmd: OpenChatWithOrganizationCommand,
  ): Promise<Either<OpenError, OpenChatResult>> {
    const exists = await this.respondability.exists(cmd.organizationId);
    if (!exists) {
      return Left(new OrganizationNotFoundForChatError());
    }

    const txResult = await this.txHost.startTransaction(
      async (tx): Promise<Either<OpenError, OpenChatResult>> => {
        const pairKey = pairKeyOf([
          { kind: 'user', subjectId: cmd.initiatorUserId as string },
          { kind: 'organization', subjectId: cmd.organizationId as string },
        ]);

        const existing = await this.chatRepo.findByPairKey(tx, pairKey);

        if (existing !== null) {
          return this.handleExistingChat(tx, existing, cmd, pairKey);
        }

        return this.handleNewChat(tx, cmd, pairKey);
      },
    );

    if (isLeft(txResult)) return txResult;

    return txResult;
  }

  private async handleNewChat(
    tx: import('@/kernel/application/ports/tx-host.js').Transaction,
    cmd: OpenChatWithOrganizationCommand,
    pairKey: string,
  ): Promise<Either<OpenError, OpenChatResult>> {
    const chatId = this.idGen.generateChatId();
    const userParticipantId = this.idGen.generateParticipantId();
    const orgParticipantId = this.idGen.generateParticipantId();
    const messageId = this.idGen.generateMessageId();
    const now = this.clock.now();

    const result = ChatEntity.open({
      type: 'OpenChat',
      chatId,
      participants: [
        {
          id: userParticipantId,
          kind: 'user',
          subjectId: cmd.initiatorUserId as string,
          assignedUserId: cmd.initiatorUserId,
        },
        {
          id: orgParticipantId,
          kind: 'organization',
          subjectId: cmd.organizationId as string,
          assignedUserId: null,
        },
      ],
      firstMessage: {
        messageId,
        senderParticipantId: userParticipantId,
        kind: cmd.message.text !== null && cmd.message.text.trim().length > 0 ? 'text' : 'media',
        text: cmd.message.text,
        mediaIds: cmd.message.mediaIds,
        attachments: cmd.message.attachments,
      },
      now,
    });

    if (isLeft(result)) return result;

    const { state, events } = result.value;
    await this.chatRepo.save(tx, state, pairKey);

    const messageEvent = events[1];
    const messageState = MessageEntity.fromSentEvent(messageEvent, cmd.initiatorUserId);
    await this.messageRepo.save(tx, messageState);

    for (const event of events) {
      await this.publisher.publish(tx, event);
    }

    return Right({ chatId, reused: false });
  }

  private async handleExistingChat(
    tx: import('@/kernel/application/ports/tx-host.js').Transaction,
    existing: import('../../domain/aggregates/chat/state.js').ChatState,
    cmd: OpenChatWithOrganizationCommand,
    pairKey: string,
  ): Promise<Either<OpenError, OpenChatResult>> {
    if (existing.status === 'blocked') {
      return Left(new ChatBlockedError());
    }

    const userSlot = existing.participants.find((p) => p.kind === 'user');
    if (userSlot === undefined) {
      return Left(new SenderNotInChatError());
    }

    const messageId = this.idGen.generateMessageId();
    const now = this.clock.now();

    const sendResult = ChatEntity.sendMessage(existing, {
      type: 'SendMessage',
      message: {
        messageId,
        senderParticipantId: userSlot.id,
        kind: cmd.message.text !== null && cmd.message.text.trim().length > 0 ? 'text' : 'media',
        text: cmd.message.text,
        mediaIds: cmd.message.mediaIds,
        attachments: cmd.message.attachments,
      },
      now,
    });

    if (isLeft(sendResult)) return sendResult;

    const { state, events } = sendResult.value;
    await this.chatRepo.save(tx, state, pairKey);

    for (const event of events) {
      if (event.type === 'chat.message.sent') {
        const messageState = MessageEntity.fromSentEvent(event, cmd.initiatorUserId);
        await this.messageRepo.save(tx, messageState);
      }
      await this.publisher.publish(tx, event);
    }

    return Right({ chatId: existing.chatId, reused: true });
  }
}
