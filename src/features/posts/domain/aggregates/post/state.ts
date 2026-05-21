import type { EntityState } from '@/infra/ddd/entity-state.js';
import type {
  MediaId,
  OrganizationId,
  PostId,
  UserId,
} from '@/kernel/domain/ids.js';

/**
 * Элемент медиа поста. Image и video имеют общую модель `(type, mediaId)` —
 * resolve URL'ов идёт на клиенте через media-preview по type+mediaId
 * (image-pipeline → /media/preview, video-pipeline → /media/video/preview).
 */
export type PostMediaItem = Readonly<{
  type: 'image' | 'video';
  mediaId: MediaId;
}>;

/**
 * v1: { visible | hidden }. Поле зашито в схему сразу, чтобы добавить ratchet
 * (auto-hide на N reports) в v1.5 без миграции. См. spec posts-posts.
 */
export type PostModerationStatus = 'visible' | 'hidden';

export type PostState = EntityState<{
  postId: PostId;
  organizationId: OrganizationId;
  authorUserId: UserId;
  text: string;
  media: readonly PostMediaItem[];
  moderationStatus: PostModerationStatus;
  createdAt: Date;
  editedAt: Date | null;
}>;
