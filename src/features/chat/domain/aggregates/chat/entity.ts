import type { SystemEvent } from '../../vo/message-kind.js';
import type { ParticipantKind } from '../../vo/participant-kind.js';
import type {
  BlockChatCommand,
  ClaimSlotCommand,
  MarkReadCommand,
  NewMessageSpec,
  OpenChatCommand,
  ReassignSlotCommand,
  ReleaseSlotCommand,
  SendMessageCommand,
  UnblockChatCommand,
} from './commands.js';
import {
  CannotActAsUserError,
  ChatBlockedError,
  ChatNotBlockedError,
  ChatNotOpenError,
  ClaimRequiredError,
  EmptyMessageError,
  ForbiddenPairError,
  InvalidParticipantsError,
  MessageTextTooLongError,
  MessageTooManyMediaError,
  OrganizationCannotInitiateError,
  ParticipantNotFoundError,
  SenderNotInChatError,
  SlotAlreadyClaimedError,
  SlotNotClaimableError,
  SlotNotClaimedError,
} from './errors.js';
import type {
  ChatBlockedEvent,
  ChatEvent,
  ChatMessageSentEvent,
  ChatOpenedEvent,
  ChatReadEvent,
  ChatUnblockedEvent,
  SlotClaimedEvent,
  SlotReassignedEvent,
  SlotReleasedEvent,
} from './events.js';
import type { ChatParticipant, ChatState, LastMessageSnapshot } from './state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import type { ChatMessageId, ChatParticipantId } from '@/kernel/domain/ids.js';

export const MESSAGE_TEXT_MAX_LENGTH = 4000;
export const MESSAGE_MEDIA_MAX_COUNT = 10;

type MessageValidationError =
  | EmptyMessageError
  | MessageTextTooLongError
  | MessageTooManyMediaError;

type OpenError =
  | InvalidParticipantsError
  | ForbiddenPairError
  | OrganizationCannotInitiateError
  | SenderNotInChatError
  | MessageValidationError;

type SendError =
  | SenderNotInChatError
  | ClaimRequiredError
  | ChatBlockedError
  | MessageValidationError;

export type OpenResult = Readonly<{
  state: ChatState;
  events: [ChatOpenedEvent, ChatMessageSentEvent];
}>;

export type SendResult = Readonly<{
  state: ChatState;
  events: ChatEvent[];
}>;

function validateMessage(spec: NewMessageSpec): Either<MessageValidationError, void> {
  const text = spec.text?.trim() ?? null;
  const hasText = text !== null && text.length > 0;
  const hasMedia = spec.mediaIds.length > 0;

  if (!hasText && !hasMedia) {
    return Left(new EmptyMessageError());
  }
  if (text !== null && text.length > MESSAGE_TEXT_MAX_LENGTH) {
    return Left(new MessageTextTooLongError());
  }
  if (spec.mediaIds.length > MESSAGE_MEDIA_MAX_COUNT) {
    return Left(new MessageTooManyMediaError());
  }
  return Right(undefined);
}

function validateParticipantSpec(p: {
  kind: ParticipantKind;
  subjectId: string | null;
}): boolean {
  switch (p.kind) {
    case 'user':
    case 'organization':
      return p.subjectId !== null;
    case 'support':
      return p.subjectId === null;
  }
}

function makePreview(spec: NewMessageSpec): string {
  if (spec.text !== null && spec.text.trim().length > 0) {
    return spec.text.slice(0, 200);
  }
  return '[media]';
}

function findParticipant(state: ChatState, id: string): ChatParticipant | undefined {
  return state.participants.find((p) => (p.id as string) === id);
}

function buildLastMessage(spec: NewMessageSpec, now: Date): LastMessageSnapshot {
  return {
    messageId: spec.messageId,
    preview: makePreview(spec),
    senderParticipantId: spec.senderParticipantId,
    createdAt: now,
  };
}

function systemPreview(systemEvent: SystemEvent): string {
  switch (systemEvent.type) {
    case 'chat.blocked':
      return '[Чат заблокирован]';
    case 'chat.unblocked':
      return '[Чат разблокирован]';
    case 'participant.claimed':
      return '[Оператор взял чат]';
    case 'participant.released':
      return '[Оператор отпустил чат]';
    case 'participant.reassigned':
      return '[Чат переназначен]';
  }
}

function buildSystemMessageEvent(
  chatId: ChatState['chatId'],
  messageId: ChatMessageId,
  systemEvent: SystemEvent,
  now: Date,
): ChatMessageSentEvent {
  return {
    type: 'chat.message.sent',
    chatId,
    messageId,
    senderParticipantId: null,
    actorUserId: null,
    kind: 'system',
    text: null,
    mediaIds: [],
    attachments: [],
    systemEvent,
    createdAt: now,
  };
}

function buildSystemLastMessage(
  messageId: ChatMessageId,
  systemEvent: SystemEvent,
  now: Date,
): LastMessageSnapshot {
  return {
    messageId,
    preview: systemPreview(systemEvent),
    senderParticipantId: null,
    createdAt: now,
  };
}

function replaceParticipant(
  state: ChatState,
  participantId: ChatParticipantId,
  patch: Partial<ChatParticipant>,
): ChatParticipant[] {
  return state.participants.map((p) =>
    (p.id as string) === (participantId as string) ? { ...p, ...patch } : p,
  );
}

function isOperatorSlot(p: ChatParticipant): boolean {
  return p.kind !== 'user';
}

type ClaimError =
  | ParticipantNotFoundError
  | SlotNotClaimableError
  | SlotAlreadyClaimedError
  | ChatNotOpenError;

type ReleaseError =
  | ParticipantNotFoundError
  | SlotNotClaimableError
  | SlotNotClaimedError
  | ChatNotOpenError;

type ReassignError =
  | ParticipantNotFoundError
  | SlotNotClaimableError
  | SlotNotClaimedError
  | ChatNotOpenError;

type BlockError =
  | ParticipantNotFoundError
  | CannotActAsUserError
  | ClaimRequiredError
  | ChatNotOpenError;

type UnblockError =
  | ParticipantNotFoundError
  | CannotActAsUserError
  | ClaimRequiredError
  | ChatNotBlockedError;

type MarkReadError = ParticipantNotFoundError;

export type ResultOf<E extends ChatEvent> = Readonly<{
  state: ChatState;
  events: [E, ChatMessageSentEvent];
}>;

export type ReadResult = Readonly<{
  state: ChatState;
  events: [ChatReadEvent];
}>;

export const ChatEntity = {
  open(cmd: OpenChatCommand): Either<OpenError, OpenResult> {
    if (cmd.participants.length !== 2) {
      return Left(new InvalidParticipantsError());
    }

    for (const p of cmd.participants) {
      if (!validateParticipantSpec(p)) {
        return Left(new InvalidParticipantsError());
      }
    }

    const a = cmd.participants[0];
    const b = cmd.participants[1];
    if (a === undefined || b === undefined) {
      return Left(new InvalidParticipantsError());
    }
    if (a.kind === b.kind) {
      return Left(new ForbiddenPairError());
    }

    const initiator = cmd.participants.find(
      (p) => (p.id as string) === (cmd.firstMessage.senderParticipantId as string),
    );
    if (initiator === undefined) {
      return Left(new SenderNotInChatError());
    }
    if (initiator.kind === 'organization') {
      return Left(new OrganizationCannotInitiateError());
    }

    const messageValidation = validateMessage(cmd.firstMessage);
    if (messageValidation.type === 'left') {
      return messageValidation;
    }

    const participants: ChatParticipant[] = cmd.participants.map((p) => ({
      id: p.id,
      kind: p.kind,
      subjectId: p.subjectId,
      assignedUserId: p.assignedUserId,
      claimedAt: p.assignedUserId !== null && p.kind !== 'user' ? cmd.now : null,
      createdAt: cmd.now,
    }));

    const lastMessage = buildLastMessage(cmd.firstMessage, cmd.now);

    const state: ChatState = {
      chatId: cmd.chatId,
      status: 'open',
      blockedByParticipantId: null,
      blockedAt: null,
      participants,
      lastMessage,
      createdAt: cmd.now,
      updatedAt: cmd.now,
    };

    const openedEvent: ChatOpenedEvent = {
      type: 'chat.opened',
      chatId: cmd.chatId,
      participants: cmd.participants.map((p) => ({
        id: p.id,
        kind: p.kind,
        subjectId: p.subjectId,
        assignedUserId: p.assignedUserId,
      })),
      initiatorParticipantId: initiator.id,
      openedAt: cmd.now,
    };

    const messageEvent: ChatMessageSentEvent = {
      type: 'chat.message.sent',
      chatId: cmd.chatId,
      messageId: cmd.firstMessage.messageId,
      senderParticipantId: cmd.firstMessage.senderParticipantId,
      actorUserId: initiator.assignedUserId,
      kind: cmd.firstMessage.kind,
      text: cmd.firstMessage.text,
      mediaIds: cmd.firstMessage.mediaIds,
      attachments: cmd.firstMessage.attachments,
      systemEvent: null,
      createdAt: cmd.now,
    };

    return Right({ state, events: [openedEvent, messageEvent] });
  },

  sendMessage(state: ChatState, cmd: SendMessageCommand): Either<SendError, SendResult> {
    const sender = findParticipant(state, cmd.message.senderParticipantId as string);
    if (sender === undefined) {
      return Left(new SenderNotInChatError());
    }

    if (sender.assignedUserId === null) {
      return Left(new ClaimRequiredError());
    }

    if (state.status === 'blocked' && sender.kind === 'user') {
      return Left(new ChatBlockedError());
    }

    const validation = validateMessage(cmd.message);
    if (validation.type === 'left') {
      return validation;
    }

    const messageEvent: ChatMessageSentEvent = {
      type: 'chat.message.sent',
      chatId: state.chatId,
      messageId: cmd.message.messageId,
      senderParticipantId: cmd.message.senderParticipantId,
      actorUserId: sender.assignedUserId,
      kind: cmd.message.kind,
      text: cmd.message.text,
      mediaIds: cmd.message.mediaIds,
      attachments: cmd.message.attachments,
      systemEvent: null,
      createdAt: cmd.now,
    };

    const nextState: ChatState = {
      ...state,
      lastMessage: buildLastMessage(cmd.message, cmd.now),
      updatedAt: cmd.now,
    };

    return Right({ state: nextState, events: [messageEvent] });
  },

  claimSlot(state: ChatState, cmd: ClaimSlotCommand): Either<ClaimError, ResultOf<SlotClaimedEvent>> {
    if (state.status !== 'open') {
      return Left(new ChatNotOpenError());
    }
    const slot = findParticipant(state, cmd.participantId as string);
    if (slot === undefined) {
      return Left(new ParticipantNotFoundError());
    }
    if (!isOperatorSlot(slot)) {
      return Left(new SlotNotClaimableError());
    }
    if (slot.assignedUserId !== null) {
      return Left(new SlotAlreadyClaimedError());
    }

    const systemEvent: SystemEvent = {
      type: 'participant.claimed',
      payload: { participantId: cmd.participantId, userId: cmd.userId },
    };
    const slotEvent: SlotClaimedEvent = {
      type: 'chat.slot.claimed',
      chatId: state.chatId,
      participantId: cmd.participantId,
      userId: cmd.userId,
      claimedAt: cmd.now,
    };
    const sysMsg = buildSystemMessageEvent(state.chatId, cmd.systemMessageId, systemEvent, cmd.now);

    const nextState: ChatState = {
      ...state,
      participants: replaceParticipant(state, cmd.participantId, {
        assignedUserId: cmd.userId,
        claimedAt: cmd.now,
      }),
      lastMessage: buildSystemLastMessage(cmd.systemMessageId, systemEvent, cmd.now),
      updatedAt: cmd.now,
    };

    return Right({ state: nextState, events: [slotEvent, sysMsg] });
  },

  releaseSlot(
    state: ChatState,
    cmd: ReleaseSlotCommand,
  ): Either<ReleaseError, ResultOf<SlotReleasedEvent>> {
    if (state.status !== 'open') {
      return Left(new ChatNotOpenError());
    }
    const slot = findParticipant(state, cmd.participantId as string);
    if (slot === undefined) {
      return Left(new ParticipantNotFoundError());
    }
    if (!isOperatorSlot(slot)) {
      return Left(new SlotNotClaimableError());
    }
    if (slot.assignedUserId === null) {
      return Left(new SlotNotClaimedError());
    }

    const oldAssignee = slot.assignedUserId;
    const systemEvent: SystemEvent = {
      type: 'participant.released',
      payload: { participantId: cmd.participantId, oldAssigneeUserId: oldAssignee },
    };
    const slotEvent: SlotReleasedEvent = {
      type: 'chat.slot.released',
      chatId: state.chatId,
      participantId: cmd.participantId,
      oldAssigneeUserId: oldAssignee,
      releasedAt: cmd.now,
    };
    const sysMsg = buildSystemMessageEvent(state.chatId, cmd.systemMessageId, systemEvent, cmd.now);

    const nextState: ChatState = {
      ...state,
      participants: replaceParticipant(state, cmd.participantId, {
        assignedUserId: null,
        claimedAt: null,
      }),
      lastMessage: buildSystemLastMessage(cmd.systemMessageId, systemEvent, cmd.now),
      updatedAt: cmd.now,
    };

    return Right({ state: nextState, events: [slotEvent, sysMsg] });
  },

  reassignSlot(
    state: ChatState,
    cmd: ReassignSlotCommand,
  ): Either<ReassignError, ResultOf<SlotReassignedEvent>> {
    if (state.status !== 'open') {
      return Left(new ChatNotOpenError());
    }
    const slot = findParticipant(state, cmd.participantId as string);
    if (slot === undefined) {
      return Left(new ParticipantNotFoundError());
    }
    if (!isOperatorSlot(slot)) {
      return Left(new SlotNotClaimableError());
    }
    if (slot.assignedUserId === null) {
      return Left(new SlotNotClaimedError());
    }

    const oldAssignee = slot.assignedUserId;
    const systemEvent: SystemEvent = {
      type: 'participant.reassigned',
      payload: {
        participantId: cmd.participantId,
        oldAssigneeUserId: oldAssignee,
        newAssigneeUserId: cmd.newAssigneeUserId,
      },
    };
    const slotEvent: SlotReassignedEvent = {
      type: 'chat.slot.reassigned',
      chatId: state.chatId,
      participantId: cmd.participantId,
      oldAssigneeUserId: oldAssignee,
      newAssigneeUserId: cmd.newAssigneeUserId,
      reassignedAt: cmd.now,
    };
    const sysMsg = buildSystemMessageEvent(state.chatId, cmd.systemMessageId, systemEvent, cmd.now);

    const nextState: ChatState = {
      ...state,
      participants: replaceParticipant(state, cmd.participantId, {
        assignedUserId: cmd.newAssigneeUserId,
        claimedAt: cmd.now,
      }),
      lastMessage: buildSystemLastMessage(cmd.systemMessageId, systemEvent, cmd.now),
      updatedAt: cmd.now,
    };

    return Right({ state: nextState, events: [slotEvent, sysMsg] });
  },

  blockChat(state: ChatState, cmd: BlockChatCommand): Either<BlockError, ResultOf<ChatBlockedEvent>> {
    if (state.status !== 'open') {
      return Left(new ChatNotOpenError());
    }
    const slot = findParticipant(state, cmd.byParticipantId as string);
    if (slot === undefined) {
      return Left(new ParticipantNotFoundError());
    }
    if (!isOperatorSlot(slot)) {
      return Left(new CannotActAsUserError());
    }
    if (slot.assignedUserId === null) {
      return Left(new ClaimRequiredError());
    }

    const systemEvent: SystemEvent = {
      type: 'chat.blocked',
      payload: { byParticipantId: cmd.byParticipantId, reason: cmd.reason },
    };
    const blockedEvent: ChatBlockedEvent = {
      type: 'chat.blocked',
      chatId: state.chatId,
      byParticipantId: cmd.byParticipantId,
      reason: cmd.reason,
      blockedAt: cmd.now,
    };
    const sysMsg = buildSystemMessageEvent(state.chatId, cmd.systemMessageId, systemEvent, cmd.now);

    const nextState: ChatState = {
      ...state,
      status: 'blocked',
      blockedByParticipantId: cmd.byParticipantId,
      blockedAt: cmd.now,
      lastMessage: buildSystemLastMessage(cmd.systemMessageId, systemEvent, cmd.now),
      updatedAt: cmd.now,
    };

    return Right({ state: nextState, events: [blockedEvent, sysMsg] });
  },

  unblockChat(
    state: ChatState,
    cmd: UnblockChatCommand,
  ): Either<UnblockError, ResultOf<ChatUnblockedEvent>> {
    if (state.status !== 'blocked') {
      return Left(new ChatNotBlockedError());
    }
    const slot = findParticipant(state, cmd.byParticipantId as string);
    if (slot === undefined) {
      return Left(new ParticipantNotFoundError());
    }
    if (!isOperatorSlot(slot)) {
      return Left(new CannotActAsUserError());
    }
    if (slot.assignedUserId === null) {
      return Left(new ClaimRequiredError());
    }

    const systemEvent: SystemEvent = {
      type: 'chat.unblocked',
      payload: { byParticipantId: cmd.byParticipantId },
    };
    const unblockedEvent: ChatUnblockedEvent = {
      type: 'chat.unblocked',
      chatId: state.chatId,
      byParticipantId: cmd.byParticipantId,
      unblockedAt: cmd.now,
    };
    const sysMsg = buildSystemMessageEvent(state.chatId, cmd.systemMessageId, systemEvent, cmd.now);

    const nextState: ChatState = {
      ...state,
      status: 'open',
      blockedByParticipantId: null,
      blockedAt: null,
      lastMessage: buildSystemLastMessage(cmd.systemMessageId, systemEvent, cmd.now),
      updatedAt: cmd.now,
    };

    return Right({ state: nextState, events: [unblockedEvent, sysMsg] });
  },

  markRead(state: ChatState, cmd: MarkReadCommand): Either<MarkReadError, ReadResult> {
    const slot = findParticipant(state, cmd.participantId);
    if (slot === undefined) {
      return Left(new ParticipantNotFoundError());
    }

    // Per-user read cursors живут в read-model (chat_participant_user_reads),
    // не в state агрегата. State не меняется — только эмитим событие.
    // Идемпотентность обеспечивается handler'ом (last_read_at compare на INSERT).
    const event: ChatReadEvent = {
      type: 'chat.read',
      chatId: state.chatId,
      participantId: cmd.participantId,
      readerUserId: cmd.readerUserId,
      slotKind: slot.kind,
      upToMessageId: cmd.upToMessageId,
      readAt: cmd.now,
    };

    return Right({ state, events: [event] });
  },
};
