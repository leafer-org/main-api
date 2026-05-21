import type { PostMediaItem } from './state.js';
import type { OrganizationId, PostId, UserId } from '@/kernel/domain/ids.js';

export type PublishPostCommand = Readonly<{
  type: 'PublishPost';
  postId: PostId;
  organizationId: OrganizationId;
  authorUserId: UserId;
  text: string;
  media: readonly PostMediaItem[];
  now: Date;
}>;

export type EditPostCommand = Readonly<{
  type: 'EditPost';
  text: string | undefined;
  media: readonly PostMediaItem[] | undefined;
  now: Date;
}>;

export type DeletePostCommand = Readonly<{
  type: 'DeletePost';
  now: Date;
}>;

export type HidePostCommand = Readonly<{
  type: 'HidePost';
  now: Date;
}>;

export type UnhidePostCommand = Readonly<{
  type: 'UnhidePost';
  now: Date;
}>;

export type PostCommand =
  | PublishPostCommand
  | EditPostCommand
  | DeletePostCommand
  | HidePostCommand
  | UnhidePostCommand;
