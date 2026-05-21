import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { POSTS_CONSUMER_ID } from './consumer-ids.js';
import { OrganizationFreshnessRepository } from '../../application/ports.js';
import { organizationFreshness } from '../db/schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { postsStreamingContract } from '@/infra/kafka-contracts/posts.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import { OrganizationId, PostId } from '@/kernel/domain/ids.js';

/**
 * Реактивная проекция organization_freshness — таблицы «последний visible пост
 * организации». Слушает posts.streaming и пересчитывает last_post_id/last_post_at
 * по соответствующим событиям. Discovery JOIN'ит таблицу при формировании feed
 * для флага hasUnreadFreshPosts.
 *
 * Правила:
 *  - post.published   → если createdAt > current.last_post_at, обновить;
 *  - post.unhidden    → симметрично published;
 *  - post.deleted     → если postId == current.last_post_id, пересчитать;
 *  - post.hidden      → симметрично deleted;
 *  - post.edited      → игнор (last_post_at не меняется при редактировании);
 *  - comment.*        → игнор (не относится к freshness).
 */
@KafkaConsumerHandlers(POSTS_CONSUMER_ID)
@Injectable()
export class FreshnessProjectionHandler {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(OrganizationFreshnessRepository)
    private readonly freshness: OrganizationFreshnessRepository,
  ) {}

  @ContractHandler(postsStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof postsStreamingContract>,
  ): Promise<void> {
    const payload = message.value;
    const orgId = OrganizationId.raw(payload.organizationId);

    switch (payload.type) {
      case 'post.published':
      case 'post.unhidden': {
        if (payload.postId === undefined || payload.postCreatedAt === undefined) return;
        const createdAt = new Date(payload.postCreatedAt);
        const current = await this.readCurrent(orgId);
        if (current === null || current.lastPostAt === null || createdAt > current.lastPostAt) {
          await this.freshness.setLastPost(NO_TRANSACTION, orgId, PostId.raw(payload.postId), createdAt);
        }
        return;
      }
      case 'post.deleted':
      case 'post.hidden': {
        if (payload.postId === undefined) return;
        const current = await this.readCurrent(orgId);
        if (current === null || (current.lastPostId as string | null) !== payload.postId) {
          // Удалили/скрыли не самый свежий — current freshness не меняется.
          return;
        }
        const latest = await this.freshness.findLatestVisiblePost(NO_TRANSACTION, orgId);
        if (latest === null) {
          await this.freshness.setLastPost(NO_TRANSACTION, orgId, null, null);
        } else {
          await this.freshness.setLastPost(NO_TRANSACTION, orgId, latest.postId, latest.createdAt);
        }
        return;
      }
      default:
        return;
    }
  }

  private async readCurrent(
    orgId: OrganizationId,
  ): Promise<{ lastPostId: PostId | null; lastPostAt: Date | null } | null> {
    const db = this.txHost.get(NO_TRANSACTION);
    const rows = await db
      .select({
        lastPostId: organizationFreshness.lastPostId,
        lastPostAt: organizationFreshness.lastPostAt,
      })
      .from(organizationFreshness)
      .where(eq(organizationFreshness.organizationId, orgId as string))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      lastPostId: row.lastPostId === null ? null : PostId.raw(row.lastPostId),
      lastPostAt: row.lastPostAt,
    };
  }
}
