import type {
  OrganizationId,
  PostCommentId,
  PostId,
  UserId,
} from '@/kernel/domain/ids.js';

export type CommentCreatedEvent = Readonly<{
  type: 'comment.created';
  commentId: PostCommentId;
  postId: PostId;
  /** organizationId владельца поста — для маршрутизации событий в org-доски. */
  organizationId: OrganizationId;
  authorUserId: UserId;
  text: string;
  createdAt: Date;
}>;

export type CommentDeletedEvent = Readonly<{
  type: 'comment.deleted';
  commentId: PostCommentId;
  postId: PostId;
  organizationId: OrganizationId;
  deletedAt: Date;
}>;

export type CommentHiddenEvent = Readonly<{
  type: 'comment.hidden';
  commentId: PostCommentId;
  postId: PostId;
  organizationId: OrganizationId;
  hiddenAt: Date;
}>;

export type CommentUnhiddenEvent = Readonly<{
  type: 'comment.unhidden';
  commentId: PostCommentId;
  postId: PostId;
  organizationId: OrganizationId;
  unhiddenAt: Date;
}>;

export type CommentEvent =
  | CommentCreatedEvent
  | CommentDeletedEvent
  | CommentHiddenEvent
  | CommentUnhiddenEvent;
