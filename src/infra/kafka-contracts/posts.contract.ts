import { Type } from 'typebox';

import { createTypeboxContract } from '@/infra/lib/nest-kafka/contract/create-typebox-contract.js';

/**
 * Унифицированное сообщение потока posts.streaming. Все события агрегатов
 * Post и Comment сериализуются в один объект с дискриминатором `type`.
 *
 * Назначение: outbox → Kafka → потребители:
 *  - organization_freshness projection (внутри feature/posts);
 *  - tickets (report-received → org-доска модерации — отложено);
 *  - аналитика/realtime (опционально).
 *
 * `key: organizationId` гарантирует упорядоченность событий одной орг
 * — критично для проекции freshness.
 */
const PostsStreamingMessage = Type.Object({
  id: Type.String(),
  type: Type.Union([
    Type.Literal('post.published'),
    Type.Literal('post.edited'),
    Type.Literal('post.deleted'),
    Type.Literal('post.hidden'),
    Type.Literal('post.unhidden'),
    Type.Literal('comment.created'),
    Type.Literal('comment.deleted'),
    Type.Literal('comment.hidden'),
    Type.Literal('comment.unhidden'),
  ]),
  organizationId: Type.String(),
  occurredAt: Type.String(),

  // post.*
  postId: Type.Optional(Type.String()),
  authorUserId: Type.Optional(Type.String()),
  text: Type.Optional(Type.String()),
  media: Type.Optional(
    Type.Array(
      Type.Object({
        type: Type.Union([Type.Literal('image'), Type.Literal('video')]),
        mediaId: Type.String(),
      }),
    ),
  ),
  /** Время публикации поста — нужно проекции, чтобы знать createdAt при delete. */
  postCreatedAt: Type.Optional(Type.String()),

  // comment.*
  commentId: Type.Optional(Type.String()),
});

export const postsStreamingContract = createTypeboxContract({
  topic: 'posts.streaming',
  schema: PostsStreamingMessage,
});

export type PostsStreamingMessage =
  import('@/infra/lib/nest-kafka/contract/contract.js').ContractMessage<
    typeof postsStreamingContract
  >;
