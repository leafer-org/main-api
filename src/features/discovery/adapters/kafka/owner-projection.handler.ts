import { Injectable } from '@nestjs/common';

import { ProjectOwnerHandler } from '../../application/use-cases/project-owner/project-owner.handler.js';
import { DISCOVERY_CONSUMER_ID } from './consumer-ids.js';
import { organizationStreamingContract } from '@/infra/kafka-contracts/organization.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import type {
  OrganizationPublishedEvent,
  OrganizationUnpublishedEvent,
} from '@/kernel/domain/events/organization.events.js';
import { MediaId, OrganizationId } from '@/kernel/domain/ids.js';

@KafkaConsumerHandlers(DISCOVERY_CONSUMER_ID)
@Injectable()
export class OwnerProjectionKafkaHandler {
  public constructor(private readonly handler: ProjectOwnerHandler) {}

  @ContractHandler(organizationStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof organizationStreamingContract>,
  ): Promise<void> {
    const payload = message.value;

    if (payload.type === 'organization.published') {
      await this.handler.handleOrganizationPublished(payload.id, {
        id: payload.id,
        type: 'organization.published',
        organizationId: OrganizationId.raw(payload.organizationId),
        name: payload.name!,
        avatarId: payload.avatarId ? MediaId.raw(payload.avatarId) : null,
        media: (payload.media ?? []).map((m) => ({ type: m.type as 'image' | 'video', mediaId: MediaId.raw(m.mediaId) })),
        republished: payload.republished ?? false,
        publishedAt: new Date(payload.publishedAt!),
      } satisfies OrganizationPublishedEvent);
    } else if (payload.type === 'organization.unpublished') {
      await this.handler.handleOrganizationUnpublished(payload.id, {
        id: payload.id,
        type: 'organization.unpublished',
        organizationId: OrganizationId.raw(payload.organizationId),
        unpublishedAt: new Date(payload.unpublishedAt!),
      } satisfies OrganizationUnpublishedEvent);
    }
  }
}
