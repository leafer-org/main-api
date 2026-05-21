import type {
  DeletePostCommand,
  EditPostCommand,
  HidePostCommand,
  PublishPostCommand,
  UnhidePostCommand,
} from './commands.js';
import {
  EmptyPostError,
  PostAlreadyHiddenError,
  PostNotHiddenError,
  PostTextTooLongError,
  PostTooManyMediaError,
} from './errors.js';
import type {
  PostDeletedEvent,
  PostEditedEvent,
  PostHiddenEvent,
  PostPublishedEvent,
  PostUnhiddenEvent,
} from './events.js';
import type { PostMediaItem, PostState } from './state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export const POST_TEXT_MAX_LENGTH = 4000;
export const POST_MEDIA_MAX_COUNT = 10;

type ContentValidationError =
  | EmptyPostError
  | PostTextTooLongError
  | PostTooManyMediaError;

function validateContent(
  text: string,
  media: readonly PostMediaItem[],
): Either<ContentValidationError, { text: string; hasMedia: boolean }> {
  const trimmed = text.trim();
  const hasText = trimmed.length > 0;
  const hasMedia = media.length > 0;
  if (!hasText && !hasMedia) {
    return Left(new EmptyPostError());
  }
  if (trimmed.length > POST_TEXT_MAX_LENGTH) {
    return Left(new PostTextTooLongError());
  }
  if (media.length > POST_MEDIA_MAX_COUNT) {
    return Left(new PostTooManyMediaError());
  }
  return Right({ text: trimmed, hasMedia });
}

export type PublishResult = Readonly<{
  state: PostState;
  events: [PostPublishedEvent];
}>;

export type EditResult = Readonly<{
  state: PostState;
  events: [PostEditedEvent];
}>;

export type DeleteResult = Readonly<{
  state: PostState;
  events: [PostDeletedEvent];
}>;

export type HideResult = Readonly<{
  state: PostState;
  events: [PostHiddenEvent];
}>;

export type UnhideResult = Readonly<{
  state: PostState;
  events: [PostUnhiddenEvent];
}>;

export const PostEntity = {
  publish(cmd: PublishPostCommand): Either<ContentValidationError, PublishResult> {
    const validation = validateContent(cmd.text, cmd.media);
    if (validation.type === 'left') {
      return validation;
    }

    const state: PostState = {
      postId: cmd.postId,
      organizationId: cmd.organizationId,
      authorUserId: cmd.authorUserId,
      text: validation.value.text,
      media: cmd.media,
      moderationStatus: 'visible',
      createdAt: cmd.now,
      editedAt: null,
    };

    const event: PostPublishedEvent = {
      type: 'post.published',
      postId: cmd.postId,
      organizationId: cmd.organizationId,
      authorUserId: cmd.authorUserId,
      text: validation.value.text,
      media: cmd.media,
      createdAt: cmd.now,
    };

    return Right({ state, events: [event] });
  },

  edit(state: PostState, cmd: EditPostCommand): Either<ContentValidationError, EditResult> {
    const nextText = cmd.text !== undefined ? cmd.text : state.text;
    const nextMedia = cmd.media !== undefined ? cmd.media : state.media;
    const validation = validateContent(nextText, nextMedia);
    if (validation.type === 'left') {
      return validation;
    }

    const nextState: PostState = {
      ...state,
      text: validation.value.text,
      media: nextMedia,
      editedAt: cmd.now,
    };

    const event: PostEditedEvent = {
      type: 'post.edited',
      postId: state.postId,
      organizationId: state.organizationId,
      text: validation.value.text,
      media: nextMedia,
      editedAt: cmd.now,
    };

    return Right({ state: nextState, events: [event] });
  },

  delete(state: PostState, cmd: DeletePostCommand): DeleteResult {
    const event: PostDeletedEvent = {
      type: 'post.deleted',
      postId: state.postId,
      organizationId: state.organizationId,
      createdAt: state.createdAt,
      deletedAt: cmd.now,
    };
    return { state, events: [event] };
  },

  hide(state: PostState, cmd: HidePostCommand): Either<PostAlreadyHiddenError, HideResult> {
    if (state.moderationStatus === 'hidden') {
      return Left(new PostAlreadyHiddenError());
    }
    const nextState: PostState = { ...state, moderationStatus: 'hidden' };
    const event: PostHiddenEvent = {
      type: 'post.hidden',
      postId: state.postId,
      organizationId: state.organizationId,
      hiddenAt: cmd.now,
    };
    return Right({ state: nextState, events: [event] });
  },

  unhide(state: PostState, cmd: UnhidePostCommand): Either<PostNotHiddenError, UnhideResult> {
    if (state.moderationStatus !== 'hidden') {
      return Left(new PostNotHiddenError());
    }
    const nextState: PostState = { ...state, moderationStatus: 'visible' };
    const event: PostUnhiddenEvent = {
      type: 'post.unhidden',
      postId: state.postId,
      organizationId: state.organizationId,
      createdAt: state.createdAt,
      unhiddenAt: cmd.now,
    };
    return Right({ state: nextState, events: [event] });
  },
};
