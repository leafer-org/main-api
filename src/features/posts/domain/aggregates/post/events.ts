import type { PostMediaItem } from './state.js';
import type { OrganizationId, PostId, UserId } from '@/kernel/domain/ids.js';

export type PostPublishedEvent = Readonly<{
  type: 'post.published';
  postId: PostId;
  organizationId: OrganizationId;
  authorUserId: UserId;
  text: string;
  media: readonly PostMediaItem[];
  createdAt: Date;
}>;

export type PostEditedEvent = Readonly<{
  type: 'post.edited';
  postId: PostId;
  organizationId: OrganizationId;
  text: string;
  media: readonly PostMediaItem[];
  editedAt: Date;
}>;

export type PostDeletedEvent = Readonly<{
  type: 'post.deleted';
  postId: PostId;
  organizationId: OrganizationId;
  createdAt: Date;
  deletedAt: Date;
}>;

export type PostHiddenEvent = Readonly<{
  type: 'post.hidden';
  postId: PostId;
  organizationId: OrganizationId;
  hiddenAt: Date;
}>;

export type PostUnhiddenEvent = Readonly<{
  type: 'post.unhidden';
  postId: PostId;
  organizationId: OrganizationId;
  createdAt: Date;
  unhiddenAt: Date;
}>;

export type PostEvent =
  | PostPublishedEvent
  | PostEditedEvent
  | PostDeletedEvent
  | PostHiddenEvent
  | PostUnhiddenEvent;
