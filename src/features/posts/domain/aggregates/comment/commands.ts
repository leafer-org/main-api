import type {
  PostCommentId,
  PostId,
  UserId,
} from '@/kernel/domain/ids.js';

export type CreateCommentCommand = Readonly<{
  type: 'CreateComment';
  commentId: PostCommentId;
  postId: PostId;
  authorUserId: UserId;
  text: string;
  now: Date;
}>;

export type DeleteCommentCommand = Readonly<{
  type: 'DeleteComment';
  now: Date;
}>;

export type HideCommentCommand = Readonly<{
  type: 'HideComment';
  now: Date;
}>;

export type UnhideCommentCommand = Readonly<{
  type: 'UnhideComment';
  now: Date;
}>;

export type CommentCommand =
  | CreateCommentCommand
  | DeleteCommentCommand
  | HideCommentCommand
  | UnhideCommentCommand;
