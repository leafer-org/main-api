import type { CommentEvent } from '../domain/aggregates/comment/events.js';
import type { CommentState } from '../domain/aggregates/comment/state.js';
import type { PostEvent } from '../domain/aggregates/post/events.js';
import type { PostState } from '../domain/aggregates/post/state.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type {
  MediaId,
  OrganizationId,
  PostCommentId,
  PostId,
  UserId,
} from '@/kernel/domain/ids.js';

// --- Aggregate repository ports (write-side, transactional) ---

export abstract class PostRepository {
  public abstract findById(tx: Transaction, postId: PostId): Promise<PostState | null>;
  public abstract save(tx: Transaction, state: PostState): Promise<void>;
  public abstract delete(tx: Transaction, postId: PostId): Promise<void>;

  /**
   * Атомарное обновление денормализованных счётчиков. Используется
   * репозиториями лайков/комментов/просмотров — НЕ в save() агрегата, потому
   * что счётчик меняется отдельно от состояния поста.
   *
   * `delta` может быть отрицательным (unlike, comment delete). Счётчик не
   * должен уйти в минус — реализация защищает GREATEST(0, like_count + delta).
   */
  public abstract incrementLikeCount(
    tx: Transaction,
    postId: PostId,
    delta: number,
  ): Promise<void>;

  public abstract incrementCommentCount(
    tx: Transaction,
    postId: PostId,
    delta: number,
  ): Promise<void>;

  public abstract incrementViewCount(
    tx: Transaction,
    postIds: readonly PostId[],
  ): Promise<void>;
}

export abstract class CommentRepository {
  public abstract findById(
    tx: Transaction,
    commentId: PostCommentId,
  ): Promise<CommentState | null>;
  public abstract save(tx: Transaction, state: CommentState): Promise<void>;
  public abstract delete(tx: Transaction, commentId: PostCommentId): Promise<void>;
}

/**
 * Like = composite-key row (post_id, user_id). Без отдельного агрегата —
 * только репозиторий с idempotent insert/delete и атомарным обновлением
 * post.like_count в той же транзакции.
 */
export abstract class PostLikeRepository {
  /**
   * Возвращает true если строка была реально вставлена (counter ++ нужен),
   * false при ON CONFLICT DO NOTHING (idempotent повтор).
   */
  public abstract addLike(tx: Transaction, postId: PostId, userId: UserId): Promise<boolean>;

  /**
   * Возвращает true если строка была реально удалена (counter -- нужен),
   * false если её не было (idempotent повтор).
   */
  public abstract removeLike(tx: Transaction, postId: PostId, userId: UserId): Promise<boolean>;
}

/**
 * View = composite-key row (user_id, post_id). Batch insert через ON CONFLICT
 * DO NOTHING. Возвращает число реально вставленных строк per post — для
 * атомарного инкремента post.view_count.
 */
export abstract class PostViewRepository {
  public abstract recordViews(
    tx: Transaction,
    userId: UserId,
    postIds: readonly PostId[],
  ): Promise<{ insertedPostIds: PostId[] }>;
}

/**
 * Read-model «свежесть постов на организации». Отдельная таблица в feature/posts
 * (владелец данных) — discovery JOIN'ит её при формировании feed.
 *
 * Обновляется реактивно от post.* событий (PostsFreshnessProjection).
 */
export abstract class OrganizationFreshnessRepository {
  public abstract setLastPost(
    tx: Transaction,
    orgId: OrganizationId,
    lastPostId: PostId | null,
    lastPostAt: Date | null,
  ): Promise<void>;

  /**
   * Найти последний visible пост организации (для пересчёта после delete/hide).
   * Возвращает null если у орг нет visible постов.
   */
  public abstract findLatestVisiblePost(
    tx: Transaction,
    orgId: OrganizationId,
  ): Promise<{ postId: PostId; createdAt: Date } | null>;
}

// --- ID generators ---

export abstract class PostIdGenerator {
  public abstract generatePostId(): PostId;
  public abstract generateCommentId(): PostCommentId;
}

// --- Event publisher (Outbox → Kafka) ---

export abstract class PostEventPublisher {
  public abstract publish(tx: Transaction, event: PostEvent | CommentEvent): Promise<void>;
}

// --- Read-model query ports ---

export type PostOwnerSummary = {
  organizationId: OrganizationId;
  name: string | null;
  avatarId: string | null;
};

export type PostListItem = {
  postId: PostId;
  organizationId: OrganizationId;
  authorUserId: UserId;
  text: string;
  media: ReadonlyArray<{ type: 'image' | 'video'; mediaId: MediaId }>;
  moderationStatus: 'visible' | 'hidden';
  likeCount: number;
  commentCount: number;
  viewCount: number;
  viewerLiked: boolean;
  editedAt: Date | null;
  createdAt: Date;
};

export type PostListPage = {
  posts: PostListItem[];
  nextCursor: string | null;
};

export abstract class PostQueryPort {
  /**
   * Получить один пост по id. viewerUserId null — анонимный запрос (viewerLiked=false).
   * Возвращает raw-строку без audience-фильтра — caller (controller) сам решает,
   * показывать ли hidden пост на основании moderationStatus + прав.
   */
  public abstract findById(
    postId: PostId,
    viewerUserId: UserId | null,
  ): Promise<PostListItem | null>;

  /**
   * Список постов организации с курсорной пагинацией.
   * `includeHidden: true` для author/employee — выдаёт visible + hidden.
   * `includeHidden: false` — visible only.
   */
  public abstract findByOrganization(
    orgId: OrganizationId,
    viewerUserId: UserId | null,
    params: { cursor?: string; limit?: number; includeHidden: boolean },
  ): Promise<PostListPage>;
}

export type CommentListItem = {
  commentId: PostCommentId;
  postId: PostId;
  authorUserId: UserId;
  text: string;
  moderationStatus: 'visible' | 'hidden';
  createdAt: Date;
};

export type CommentListPage = {
  comments: CommentListItem[];
  nextCursor: string | null;
};

export abstract class CommentQueryPort {
  /**
   * `includeHidden: true` для сотрудников орг с posts.moderate-comments —
   * видят все комменты включая hidden. Author коммента видит свой hidden
   * коммент через отдельную фильтрацию в caller (не через includeHidden).
   */
  public abstract findByPost(
    postId: PostId,
    viewerUserId: UserId | null,
    params: { cursor?: string; limit?: number; includeHidden: boolean },
  ): Promise<CommentListPage>;
}
