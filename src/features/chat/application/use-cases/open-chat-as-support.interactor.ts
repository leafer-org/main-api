import { Inject, Injectable } from '@nestjs/common';

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
  type SenderNotInChatError,
  type SlotAlreadyClaimedError,
} from '../../domain/aggregates/chat/errors.js';
import { MessageEntity } from '../../domain/aggregates/message/entity.js';
import {
  ContextItemMismatchError,
  ContextItemNotFoundError,
  OrganizationNotFoundForChatError,
} from '../errors.js';
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
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type {
  ChatId,
  MediaId,
  OrganizationId,
  UserId,
} from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

export type SupportTarget =
  | { kind: 'user'; userId: UserId }
  | { kind: 'organization'; organizationId: OrganizationId };

export type OpenChatAsSupportCommand = {
  actorUserId: UserId; // admin
  target: SupportTarget;
  message: { text: string | null; mediaIds: readonly MediaId[] };
};

export type OpenChatResult = { chatId: ChatId; reused: boolean; reopened: boolean };

type OpenError =
  | OrganizationNotFoundForChatError
  | ContextItemNotFoundError
  | ContextItemMismatchError
  | EmptyMessageError
  | MessageTextTooLongError
  | MessageTooManyMediaError
  | InvalidParticipantsError
  | ForbiddenPairError
  | OrganizationCannotInitiateError
  | SenderNotInChatError
  | ChatBlockedError
  | ClaimRequiredError
  | SlotAlreadyClaimedError
  | import('../../domain/aggregates/chat/errors.js').SlotNotClaimableError
  | import('../../domain/aggregates/chat/errors.js').ChatNotOpenError
  | import('../../domain/aggregates/chat/errors.js').ParticipantNotFoundError;

@Injectable()
export class OpenChatAsSupportInteractor {
  public constructor(
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
    @Inject(MessageRepository) private readonly messageRepo: MessageRepository,
    @Inject(ChatIdGenerator) private readonly idGen: ChatIdGenerator,
    @Inject(OrganizationRespondabilityPort)
    private readonly respondability: OrganizationRespondabilityPort,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
    @Inject(ChatEventPublisher) private readonly publisher: ChatEventPublisher,
  ) {}

  public async execute(cmd: OpenChatAsSupportCommand): Promise<Either<OpenError, OpenChatResult>> {
    const auth = await this.permissionCheck.mustCan(Permission.ChatInitiateAsSupport);
    if (isLeft(auth)) return auth as never;

    if (cmd.target.kind === 'organization') {
      const exists = await this.respondability.exists(cmd.target.organizationId);
      if (!exists) return Left(new OrganizationNotFoundForChatError());
    }

    return this.txHost.startTransaction(async (tx) => {
      const counterParty =
        cmd.target.kind === 'user'
          ? { kind: 'user' as const, subjectId: cmd.target.userId as string }
          : {
              kind: 'organization' as const,
              subjectId: cmd.target.organizationId as string,
            };

      const pairKey = pairKeyOf([
        counterParty,
        { kind: 'support', subjectId: null },
      ]);
      const existing = await this.chatRepo.findByPairKey(tx, pairKey);

      if (existing !== null) {
        if (existing.status === 'blocked') return Left(new ChatBlockedError());

        const supportSlot = existing.participants.find((p) => p.kind === 'support');
        if (!supportSlot) return Left(new ChatBlockedError());

        let workingChat = existing;

        // Если support unclaimed — claim текущим админом.
        if (supportSlot.assignedUserId === null) {
          const claimResult = ChatEntity.claimSlot(existing, {
            type: 'ClaimSlot',
            participantId: supportSlot.id,
            userId: cmd.actorUserId,
            systemMessageId: this.idGen.generateMessageId(),
            now: this.clock.now(),
          });
          if (isLeft(claimResult)) return claimResult;
          workingChat = claimResult.value.state;
          for (const event of claimResult.value.events) {
            if (event.type === 'chat.message.sent') {
              await this.messageRepo.save(tx, MessageEntity.fromSentEvent(event, null));
            }
            await this.publisher.publish(tx, event);
          }
        }

        const sender = workingChat.participants.find((p) => p.kind === 'support');
        if (!sender || sender.assignedUserId === null) {
          return Left(new ChatBlockedError());
        }

        const messageId = this.idGen.generateMessageId();
        const sendResult = ChatEntity.sendMessage(workingChat, {
          type: 'SendMessage',
          message: {
            messageId,
            senderParticipantId: sender.id,
            kind: kindOf(cmd.message.text),
            text: cmd.message.text,
            mediaIds: cmd.message.mediaIds,
          },
          now: this.clock.now(),
        });
        if (isLeft(sendResult)) return sendResult;

        await this.persist(tx, sendResult.value, cmd.actorUserId, pairKey);
        const reopened = sendResult.value.events.some((e) => e.type === 'chat.reopened');
        return Right({ chatId: existing.chatId, reused: true, reopened });
      }

      const chatId = this.idGen.generateChatId();
      const supportPid = this.idGen.generateParticipantId();
      const counterPid = this.idGen.generateParticipantId();
      const messageId = this.idGen.generateMessageId();

      const result = ChatEntity.open({
        type: 'OpenChat',
        chatId,
        participants: [
          {
            id: supportPid,
            kind: 'support',
            subjectId: null,
            assignedUserId: cmd.actorUserId, // proactive — claim сразу
          },
          {
            id: counterPid,
            kind: cmd.target.kind === 'user' ? 'user' : 'organization',
            subjectId:
              cmd.target.kind === 'user'
                ? (cmd.target.userId as string)
                : (cmd.target.organizationId as string),
            assignedUserId: cmd.target.kind === 'user' ? cmd.target.userId : null,
          },
        ],
        contextItemId: null,
        firstMessage: {
          messageId,
          senderParticipantId: supportPid,
          kind: kindOf(cmd.message.text),
          text: cmd.message.text,
          mediaIds: cmd.message.mediaIds,
        },
        now: this.clock.now(),
      });
      if (isLeft(result)) return result;

      await this.persist(tx, result.value, cmd.actorUserId, pairKey);
      return Right({ chatId, reused: false, reopened: false });
    });
  }

  private async persist(
    tx: import('@/kernel/application/ports/tx-host.js').Transaction,
    payload: {
      state: import('../../domain/aggregates/chat/state.js').ChatState;
      events: ReadonlyArray<import('../../domain/aggregates/chat/events.js').ChatEvent>;
    },
    actorUserId: UserId,
    pairKey: string,
  ): Promise<void> {
    await this.chatRepo.save(tx, payload.state, pairKey);
    for (const event of payload.events) {
      if (event.type === 'chat.message.sent') {
        const isSystem = event.kind === 'system';
        await this.messageRepo.save(
          tx,
          MessageEntity.fromSentEvent(event, isSystem ? null : actorUserId),
        );
      }
      await this.publisher.publish(tx, event);
    }
  }
}

function kindOf(text: string | null): 'text' | 'media' {
  return text !== null && text.trim().length > 0 ? 'text' : 'media';
}
