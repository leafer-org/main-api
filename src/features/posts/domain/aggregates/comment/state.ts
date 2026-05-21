import type { EntityState } from '@/infra/ddd/entity-state.js';
import type {
  PostCommentId,
  PostId,
  UserId,
} from '@/kernel/domain/ids.js';

export type CommentModerationStatus = 'visible' | 'hidden';

export type CommentState = EntityState<{
  commentId: PostCommentId;
  postId: PostId;
  authorUserId: UserId;
  text: string;
  moderationStatus: CommentModerationStatus;
  createdAt: Date;
}>;
