import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PostEventPublisher } from '../../application/ports.js';
import type { CommentEvent } from '../../domain/aggregates/comment/events.js';
import type { PostEvent } from '../../domain/aggregates/post/events.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { postsStreamingContract } from '@/infra/kafka-contracts/posts.contract.js';
import { OutboxService } from '@/infra/lib/nest-outbox/outbox.service.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';

/**
 * Транзакционный publisher: складывает событие посты в outbox в той же
 * транзакции, что и save аггрегата. Outbox-диспетчер дальше отправляет в
 * Kafka topic `posts.streaming`.
 *
 * `key: organizationId` гарантирует упорядоченность событий одной орг —
 * критично для projection organization_freshness, чтобы избежать race на
 * последовательных PostPublished/PostDeleted.
 */
@Injectable()
export class OutboxPostEventPublisher extends PostEventPublisher {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {
    super();
  }

  public async publish(tx: Transaction, event: PostEvent | CommentEvent): Promise<void> {
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(db, postsStreamingContract, this.toMessage(event), {
      key: event.organizationId as string,
    });
  }

  private toMessage(event: PostEvent | CommentEvent) {
    const id = randomUUID();
    const organizationId = event.organizationId as string;

    switch (event.type) {
      case 'post.published':
        return {
          id,
          type: event.type,
          organizationId,
          occurredAt: event.createdAt.toISOString(),
          postId: event.postId as string,
          authorUserId: event.authorUserId as string,
          text: event.text,
          media: event.media.map((m) => ({ type: m.type, mediaId: m.mediaId as string })),
          postCreatedAt: event.createdAt.toISOString(),
        };
      case 'post.edited':
        return {
          id,
          type: event.type,
          organizationId,
          occurredAt: event.editedAt.toISOString(),
          postId: event.postId as string,
          text: event.text,
          media: event.media.map((m) => ({ type: m.type, mediaId: m.mediaId as string })),
        };
      case 'post.deleted':
        return {
          id,
          type: event.type,
          organizationId,
          occurredAt: event.deletedAt.toISOString(),
          postId: event.postId as string,
          postCreatedAt: event.createdAt.toISOString(),
        };
      case 'post.hidden':
        return {
          id,
          type: event.type,
          organizationId,
          occurredAt: event.hiddenAt.toISOString(),
          postId: event.postId as string,
        };
      case 'post.unhidden':
        return {
          id,
          type: event.type,
          organizationId,
          occurredAt: event.unhiddenAt.toISOString(),
          postId: event.postId as string,
          postCreatedAt: event.createdAt.toISOString(),
        };
      case 'comment.created':
        return {
          id,
          type: event.type,
          organizationId,
          occurredAt: event.createdAt.toISOString(),
          commentId: event.commentId as string,
          postId: event.postId as string,
          authorUserId: event.authorUserId as string,
          text: event.text,
        };
      case 'comment.deleted':
        return {
          id,
          type: event.type,
          organizationId,
          occurredAt: event.deletedAt.toISOString(),
          commentId: event.commentId as string,
          postId: event.postId as string,
        };
      case 'comment.hidden':
        return {
          id,
          type: event.type,
          organizationId,
          occurredAt: event.hiddenAt.toISOString(),
          commentId: event.commentId as string,
          postId: event.postId as string,
        };
      case 'comment.unhidden':
        return {
          id,
          type: event.type,
          organizationId,
          occurredAt: event.unhiddenAt.toISOString(),
          commentId: event.commentId as string,
          postId: event.postId as string,
        };
    }
  }
}
