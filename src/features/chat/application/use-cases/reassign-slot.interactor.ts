import { Inject, Injectable } from '@nestjs/common';

import { ChatEntity } from '../../domain/aggregates/chat/entity.js';
import {
  ChatNotFoundError,
  type ChatNotOpenError,
  type ParticipantNotFoundError,
  type SlotNotClaimableError,
  type SlotNotClaimedError,
} from '../../domain/aggregates/chat/errors.js';
import { MessageEntity } from '../../domain/aggregates/message/entity.js';
import { NotAChatResponderError } from '../errors.js';
import { pairKeyOf } from '../pair-key.js';
import {
  ChatEventPublisher,
  ChatIdGenerator,
  ChatRepository,
  MessageRepository,
  SlotPoolResolver,
} from '../ports.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ChatId, ChatParticipantId, UserId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

export type ReassignSlotCommand = {
  chatId: ChatId;
  participantId: ChatParticipantId;
  actorUserId: UserId;
  newAssigneeUserId: UserId;
};

type ReassignError =
  | ChatNotFoundError
  | ParticipantNotFoundError
  | SlotNotClaimableError
  | SlotNotClaimedError
  | ChatNotOpenError
  | NotAChatResponderError;

@Injectable()
export class ReassignSlotInteractor {
  public constructor(
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
    @Inject(MessageRepository) private readonly messageRepo: MessageRepository,
    @Inject(ChatIdGenerator) private readonly idGen: ChatIdGenerator,
    @Inject(SlotPoolResolver) private readonly resolver: SlotPoolResolver,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
    @Inject(ChatEventPublisher) private readonly publisher: ChatEventPublisher,
  ) {}

  public async execute(cmd: ReassignSlotCommand): Promise<Either<ReassignError, void>> {
    return this.txHost.startTransaction(async (tx) => {
      const chat = await this.chatRepo.findById(tx, cmd.chatId);
      if (!chat) return Left(new ChatNotFoundError());

      const slot = chat.participants.find((p) => (p.id as string) === (cmd.participantId as string));
      if (!slot) return Left(new ChatNotFoundError());

      const isOwner =
        slot.assignedUserId !== null &&
        (slot.assignedUserId as string) === (cmd.actorUserId as string);

      if (!isOwner) {
        const hasOverride = await this.permissionCheck.can(Permission.ChatReassignAny);
        if (!hasOverride) return Left(new NotAChatResponderError());
      }

      const allowedNew = await this.resolver.canAssign(
        slot.kind,
        slot.subjectId,
        cmd.newAssigneeUserId,
      );
      if (!allowedNew) return Left(new NotAChatResponderError());

      const result = ChatEntity.reassignSlot(chat, {
        type: 'ReassignSlot',
        participantId: cmd.participantId,
        newAssigneeUserId: cmd.newAssigneeUserId,
        systemMessageId: this.idGen.generateMessageId(),
        now: this.clock.now(),
      });
      if (isLeft(result)) return result;

      const { state, events } = result.value;
      await this.chatRepo.save(tx, state, pairKeyOf(state.participants));

      for (const event of events) {
        if (event.type === 'chat.message.sent') {
          await this.messageRepo.save(tx, MessageEntity.fromSentEvent(event, null));
        }
        await this.publisher.publish(tx, event);
      }

      return Right(undefined);
    });
  }
}
