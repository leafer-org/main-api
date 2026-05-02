import { Inject, Injectable } from '@nestjs/common';

import { OrganizationEntity } from '../../../domain/aggregates/organization/entity.js';
import { OrganizationNotFoundError } from '../../../domain/aggregates/organization/errors.js';
import { OrganizationPermissionCheckService } from '../../organization-permission.js';
import {
  ItemEventPublisher,
  ItemRepository,
  OrganizationEventPublisher,
  OrganizationRepository,
} from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId, UserId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class UnpublishOrganizationInteractor {
  public constructor(
    @Inject(OrganizationPermissionCheckService)
    private readonly permissionCheck: OrganizationPermissionCheckService,
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(ItemRepository) private readonly itemRepository: ItemRepository,
    @Inject(OrganizationEventPublisher)
    private readonly orgEventPublisher: OrganizationEventPublisher,
    @Inject(ItemEventPublisher) private readonly itemEventPublisher: ItemEventPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: { organizationId: OrganizationId; userId: UserId }) {
    const auth = await this.permissionCheck.mustHavePermission(
      command.organizationId,
      command.userId,
      'publish_organization',
      { globalBypass: Permission.OrganizationInfoPublish },
    );
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.organizationRepository.findById(tx, command.organizationId);
      if (!state) return Left(new OrganizationNotFoundError());

      const result = OrganizationEntity.unpublishInfo(state, {
        type: 'UnpublishOrganization',
        now,
      });
      if (isLeft(result)) return result;

      const { state: newState, event: domainEvent } = result.value;
      await this.organizationRepository.save(tx, newState);

      await this.orgEventPublisher.publishOrganizationUnpublished(tx, {
        id: crypto.randomUUID(),
        type: 'organization.unpublished',
        organizationId: state.id,
        unpublishedAt: domainEvent.unpublishedAt,
      });

      // Unpublish all published items
      const publishedItems = await this.itemRepository.findPublishedByOrganizationId(
        tx,
        command.organizationId,
      );
      await Promise.all(
        publishedItems.map((item) =>
          this.itemEventPublisher.publishItemUnpublished(tx, {
            id: crypto.randomUUID(),
            type: 'item.unpublished',
            itemId: item.itemId,
            unpublishedAt: now,
          }),
        ),
      );

      return Right(undefined);
    });
  }
}
