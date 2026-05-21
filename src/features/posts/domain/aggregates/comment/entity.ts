import type {
  CreateCommentCommand,
  DeleteCommentCommand,
  HideCommentCommand,
  UnhideCommentCommand,
} from './commands.js';
import {
  CommentAlreadyHiddenError,
  CommentNotHiddenError,
  CommentTooLongError,
  EmptyCommentError,
} from './errors.js';
import type {
  CommentCreatedEvent,
  CommentDeletedEvent,
  CommentHiddenEvent,
  CommentUnhiddenEvent,
} from './events.js';
import type { CommentState } from './state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';

export const COMMENT_TEXT_MAX_LENGTH = 2000;

type ContentValidationError = EmptyCommentError | CommentTooLongError;

function validateText(text: string): Either<ContentValidationError, string> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return Left(new EmptyCommentError());
  if (trimmed.length > COMMENT_TEXT_MAX_LENGTH) return Left(new CommentTooLongError());
  return Right(trimmed);
}

export type CreateResult = Readonly<{
  state: CommentState;
  events: [CommentCreatedEvent];
}>;

export type DeleteResult = Readonly<{
  state: CommentState;
  events: [CommentDeletedEvent];
}>;

export type HideResult = Readonly<{
  state: CommentState;
  events: [CommentHiddenEvent];
}>;

export type UnhideResult = Readonly<{
  state: CommentState;
  events: [CommentUnhiddenEvent];
}>;

export const CommentEntity = {
  create(
    cmd: CreateCommentCommand,
    organizationId: OrganizationId,
  ): Either<ContentValidationError, CreateResult> {
    const validation = validateText(cmd.text);
    if (validation.type === 'left') return validation;

    const state: CommentState = {
      commentId: cmd.commentId,
      postId: cmd.postId,
      authorUserId: cmd.authorUserId,
      text: validation.value,
      moderationStatus: 'visible',
      createdAt: cmd.now,
    };

    const event: CommentCreatedEvent = {
      type: 'comment.created',
      commentId: cmd.commentId,
      postId: cmd.postId,
      organizationId,
      authorUserId: cmd.authorUserId,
      text: validation.value,
      createdAt: cmd.now,
    };

    return Right({ state, events: [event] });
  },

  delete(
    state: CommentState,
    cmd: DeleteCommentCommand,
    organizationId: OrganizationId,
  ): DeleteResult {
    const event: CommentDeletedEvent = {
      type: 'comment.deleted',
      commentId: state.commentId,
      postId: state.postId,
      organizationId,
      deletedAt: cmd.now,
    };
    return { state, events: [event] };
  },

  hide(
    state: CommentState,
    cmd: HideCommentCommand,
    organizationId: OrganizationId,
  ): Either<CommentAlreadyHiddenError, HideResult> {
    if (state.moderationStatus === 'hidden') return Left(new CommentAlreadyHiddenError());
    const nextState: CommentState = { ...state, moderationStatus: 'hidden' };
    const event: CommentHiddenEvent = {
      type: 'comment.hidden',
      commentId: state.commentId,
      postId: state.postId,
      organizationId,
      hiddenAt: cmd.now,
    };
    return Right({ state: nextState, events: [event] });
  },

  unhide(
    state: CommentState,
    cmd: UnhideCommentCommand,
    organizationId: OrganizationId,
  ): Either<CommentNotHiddenError, UnhideResult> {
    if (state.moderationStatus !== 'hidden') return Left(new CommentNotHiddenError());
    const nextState: CommentState = { ...state, moderationStatus: 'visible' };
    const event: CommentUnhiddenEvent = {
      type: 'comment.unhidden',
      commentId: state.commentId,
      postId: state.postId,
      organizationId,
      unhiddenAt: cmd.now,
    };
    return Right({ state: nextState, events: [event] });
  },
};
