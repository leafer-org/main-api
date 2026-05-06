import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

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
import { OrganizationId, UserId } from '@/kernel/domain/ids.js';

/**
 * Слушает тонкое событие `organization.respondability-changed` и пересчитывает
 * локальную проекцию: вызывает OrganizationRespondabilityPort и upsert/delete.
 *
 * Так логика «может ли user отвечать как org» остаётся в feature/organization,
 * а chat имеет быструю локальную таблицу для list-запросов
 * (operator chat list, notifications routing).
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

    if (payload.type !== 'organization.respondability-changed') return;
    if (payload.userId === undefined) return;

    const orgId = OrganizationId.raw(payload.organizationId);
    const userId = UserId.raw(payload.userId);

    const canRespond = await this.respondability.canRespondAsOrganization(orgId, userId);

    const db = this.txHost.get(NO_TRANSACTION);

    if (canRespond) {
      await db
        .insert(chatOrganizationMembers)
        .values({
          organizationId: orgId as string,
          userId: userId as string,
          joinedAt: new Date(payload.changedAt ?? new Date().toISOString()),
        })
        .onConflictDoNothing({
          target: [chatOrganizationMembers.organizationId, chatOrganizationMembers.userId],
        });
    } else {
      await db
        .delete(chatOrganizationMembers)
        .where(
          and(
            eq(chatOrganizationMembers.organizationId, orgId as string),
            eq(chatOrganizationMembers.userId, userId as string),
          ),
        );
    }
  }
}
