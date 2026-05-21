import { MESSAGE_MEDIA_MAX_COUNT, MESSAGE_TEXT_MAX_LENGTH } from '../chat/entity.js';
import {
  EmptyMessageError,
  MessageTextTooLongError,
  MessageTooManyMediaError,
} from '../chat/errors.js';
import type { ChatMessageSentEvent } from '../chat/events.js';
import type { DeleteMessageCommand, EditMessageCommand } from './commands.js';
import {
  CannotModifySystemMessageError,
  DeleteWindowExpiredError,
  EditWindowExpiredError,
  MessageAlreadyDeletedError,
  MessageDeletedError,
  NotMessageAuthorError,
} from './errors.js';
import type { MessageDeletedEvent, MessageEditedEvent } from './events.js';
import type { MessageState } from './state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import type { MediaId, UserId } from '@/kernel/domain/ids.js';

export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
export const MESSAGE_DELETE_WINDOW_MS = 15 * 60 * 1000;

type MessageValidationError =
  | EmptyMessageError
  | MessageTextTooLongError
  | MessageTooManyMediaError;

type EditError =
  | NotMessageAuthorError
  | CannotModifySystemMessageError
  | MessageDeletedError
  | EditWindowExpiredError
  | MessageValidationError;

type DeleteError =
  | NotMessageAuthorError
  | CannotModifySystemMessageError
  | MessageAlreadyDeletedError
  | DeleteWindowExpiredError;

export type EditResult = Readonly<{
  state: MessageState;
  events: [MessageEditedEvent];
}>;

export type DeleteResult = Readonly<{
  state: MessageState;
  events: [MessageDeletedEvent];
}>;

function validateContent(
  text: string | null,
  mediaIds: readonly MediaId[],
): Either<MessageValidationError, void> {
  const trimmed = text?.trim() ?? null;
  const hasText = trimmed !== null && trimmed.length > 0;
  const hasMedia = mediaIds.length > 0;

  if (!hasText && !hasMedia) {
    return Left(new EmptyMessageError());
  }
  if (trimmed !== null && trimmed.length > MESSAGE_TEXT_MAX_LENGTH) {
    return Left(new MessageTextTooLongError());
  }
  if (mediaIds.length > MESSAGE_MEDIA_MAX_COUNT) {
    return Left(new MessageTooManyMediaError());
  }
  return Right(undefined);
}

function isAuthor(state: MessageState, userId: UserId): boolean {
  return state.actorUserId !== null && (state.actorUserId as string) === (userId as string);
}

function withinWindow(state: MessageState, now: Date, windowMs: number): boolean {
  return now.getTime() - state.createdAt.getTime() <= windowMs;
}

export const MessageEntity = {
  /**
   * Hydrate MessageState из ChatMessageSentEvent.
   * Используется репозиторием при записи сообщения после Decide.
   */
  fromSentEvent(event: ChatMessageSentEvent, actorUserId: UserId | null): MessageState {
    return {
      messageId: event.messageId,
      chatId: event.chatId,
      senderParticipantId: event.senderParticipantId,
      actorUserId,
      kind: event.kind,
      text: event.text,
      mediaIds: event.mediaIds,
      attachments: event.attachments,
      systemEvent: event.systemEvent,
      createdAt: event.createdAt,
      editedAt: null,
      deletedAt: null,
    };
  },

  edit(state: MessageState, cmd: EditMessageCommand): Either<EditError, EditResult> {
    if (state.kind === 'system') {
      return Left(new CannotModifySystemMessageError());
    }
    if (!isAuthor(state, cmd.actorUserId)) {
      return Left(new NotMessageAuthorError());
    }
    if (state.deletedAt !== null) {
      return Left(new MessageDeletedError());
    }
    if (!withinWindow(state, cmd.now, MESSAGE_EDIT_WINDOW_MS)) {
      return Left(new EditWindowExpiredError());
    }

    const validation = validateContent(cmd.text, cmd.mediaIds);
    if (validation.type === 'left') {
      return validation;
    }

    const nextKind = cmd.text !== null && cmd.text.trim().length > 0 ? 'text' : 'media';

    const event: MessageEditedEvent = {
      type: 'chat.message.edited',
      chatId: state.chatId,
      messageId: state.messageId,
      actorUserId: cmd.actorUserId,
      text: cmd.text,
      mediaIds: cmd.mediaIds,
      editedAt: cmd.now,
    };

    const nextState: MessageState = {
      ...state,
      kind: nextKind,
      text: cmd.text,
      mediaIds: cmd.mediaIds,
      editedAt: cmd.now,
    };

    return Right({ state: nextState, events: [event] });
  },

  delete(state: MessageState, cmd: DeleteMessageCommand): Either<DeleteError, DeleteResult> {
    if (state.kind === 'system') {
      return Left(new CannotModifySystemMessageError());
    }
    if (!isAuthor(state, cmd.actorUserId)) {
      return Left(new NotMessageAuthorError());
    }
    if (state.deletedAt !== null) {
      return Left(new MessageAlreadyDeletedError());
    }
    if (!withinWindow(state, cmd.now, MESSAGE_DELETE_WINDOW_MS)) {
      return Left(new DeleteWindowExpiredError());
    }

    const event: MessageDeletedEvent = {
      type: 'chat.message.deleted',
      chatId: state.chatId,
      messageId: state.messageId,
      actorUserId: cmd.actorUserId,
      deletedAt: cmd.now,
    };

    const nextState: MessageState = {
      ...state,
      text: null,
      mediaIds: [],
      deletedAt: cmd.now,
    };

    return Right({ state: nextState, events: [event] });
  },
};
