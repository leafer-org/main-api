import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { CHAT_CONSUMER_ID } from './consumer-ids.js';
import { chatOrganizationMembers } from '../db/schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { organizationStreamingContract } from '@/infra/kafka-contracts/organization.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import { OrganizationRespondabilityPort } from '@/kernel/application/ports/organization-respondability.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import { OrganizationId } from '@/kernel/domain/ids.js';

/**
 * На тонкое `organization.changed` пересинкаем локальную проекцию членства:
 * берём актуальный список respondable userIds через
 * `OrganizationRespondabilityPort` и сводим diff с `chat_organization_members`.
 *
 * Локальная проекция нужна для быстрых list-запросов (operator chat list,
 * notifications routing) — без хождения в organization на каждый запрос.
 */
@KafkaConsumerHandlers(CHAT_CONSUMER_ID)
@Injectable()
export class OrganizationMembershipProjectionHandler {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(OrganizationRespondabilityPort)
    private readonly respondability: OrganizationRespondabilityPort,
  ) {}

  @ContractHandler(organizationStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof organizationStreamingContract>,
  ): Promise<void> {
    const payload = message.value;
    const orgId = OrganizationId.raw(payload.organizationId);
    const changedAt = new Date(payload.changedAt);
    const db = this.txHost.get(NO_TRANSACTION);

    const desired = await this.respondability.findRespondableUserIds(orgId);
    const desiredSet = new Set(desired.map((u) => u as string));

    const existing = await db
      .select({ userId: chatOrganizationMembers.userId })
      .from(chatOrganizationMembers)
      .where(eq(chatOrganizationMembers.organizationId, orgId as string));
    const existingSet = new Set(existing.map((r) => r.userId));

    const toAdd = [...desiredSet].filter((u) => !existingSet.has(u));
    const toRemove = [...existingSet].filter((u) => !desiredSet.has(u));

    if (toAdd.length > 0) {
      await db
        .insert(chatOrganizationMembers)
        .values(
          toAdd.map((userId) => ({
            organizationId: orgId as string,
            userId,
            joinedAt: changedAt,
          })),
        )
        .onConflictDoNothing({
          target: [chatOrganizationMembers.organizationId, chatOrganizationMembers.userId],
        });
    }

    if (toRemove.length > 0) {
      await db
        .delete(chatOrganizationMembers)
        .where(
          and(
            eq(chatOrganizationMembers.organizationId, orgId as string),
            inArray(chatOrganizationMembers.userId, toRemove),
          ),
        );
    }
  }
}
