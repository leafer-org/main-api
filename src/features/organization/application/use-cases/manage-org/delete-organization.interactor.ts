import { Inject, Injectable } from '@nestjs/common';

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
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId, UserId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class DeleteOrganizationInteractor {
  public constructor(
    @Inject(PermissionCheckService) private readonly globalPermissionCheck: PermissionCheckService,
    @Inject(OrganizationPermissionCheckService)
    private readonly orgPermissionCheck: OrganizationPermissionCheckService,
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(ItemRepository) private readonly itemRepository: ItemRepository,
    @Inject(OrganizationEventPublisher)
    private readonly orgEventPublisher: OrganizationEventPublisher,
    @Inject(ItemEventPublisher) private readonly itemEventPublisher: ItemEventPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: { organizationId: OrganizationId; userId: UserId }) {
    const isAdmin = await this.globalPermissionCheck.can(Permissions.manageOrganization);
    if (!isAdmin) {
      const ownerCheck = await this.orgPermissionCheck.mustBeEmployee(
        command.organizationId,
        command.userId,
      );
      if (isLeft(ownerCheck)) return ownerCheck;

      if (!ownerCheck.value.isOwner) {
        return Left(new OrganizationNotFoundError());
      }
    }

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.organizationRepository.findById(tx, command.organizationId);
      if (!state) return Left(new OrganizationNotFoundError());

      // Unpublish org from discovery if it was published
      if (state.infoPublication) {
        await this.orgEventPublisher.publishOrganizationUnpublished(tx, {
          id: crypto.randomUUID(),
          type: 'organization.unpublished',
          organizationId: state.id,
          unpublishedAt: now,
        });
      }

      // Unpublish all published items from discovery
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

      // Delete all items then the organization
      await this.itemRepository.deleteByOrganizationId(tx, command.organizationId);
      await this.organizationRepository.delete(tx, command.organizationId);

      return Right(undefined);
    });
  }
}
