import { Inject, Injectable } from '@nestjs/common';

import { ItemEntity } from '../../../domain/aggregates/item/entity.js';
import { OrganizationNotFoundError } from '../../../domain/aggregates/organization/errors.js';
import { OrganizationPermissionCheckService } from '../../organization-permission.js';
import { ItemRepository, OrganizationRepository } from '../../ports.js';
import { CreateDomainError } from '@/infra/ddd/error.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { CatalogValidationPort } from '@/kernel/application/ports/catalog-validation.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { Permissions } from '@/kernel/domain/permissions.js';
import type { ItemId, OrganizationId, TypeId, UserId } from '@/kernel/domain/ids.js';
import { ALL_WIDGET_TYPES, type ItemWidget } from '@/kernel/domain/vo/widget.js';

export class ItemTypeNotFoundError extends CreateDomainError('item_type_not_found', 404) {}

@Injectable()
export class CreateItemInteractor {
  public constructor(
    @Inject(ItemRepository) private readonly itemRepository: ItemRepository,
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(CatalogValidationPort) private readonly catalogValidation: CatalogValidationPort,
    @Inject(OrganizationPermissionCheckService)
    private readonly permissionCheck: OrganizationPermissionCheckService,
    @Inject(PermissionCheckService) private readonly globalPermissionCheck: PermissionCheckService,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: {
    organizationId: OrganizationId;
    userId?: UserId;
    itemId: ItemId;
    typeId: TypeId;
    widgets: ItemWidget[];
  }) {
    const isAdmin = await this.globalPermissionCheck.can(Permissions.manageOrganization);

    if (command.userId) {
      const auth = await this.permissionCheck.mustHavePermission(
        command.organizationId,
        command.userId,
        'edit_items',
      );
      if (isLeft(auth)) return auth;
    } else {
      const auth = await this.globalPermissionCheck.mustCan(Permissions.manageOrganization);
      if (isLeft(auth)) return auth;
    }

    const itemType = await this.catalogValidation.getItemType(command.typeId);
    if (!itemType) return Left(new ItemTypeNotFoundError());

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const org = await this.organizationRepository.findById(tx, command.organizationId);
      if (!org) return Left(new OrganizationNotFoundError());

      const result = ItemEntity.create({
        type: 'CreateItem',
        itemId: command.itemId,
        organizationId: command.organizationId,
        typeId: command.typeId,
        widgets: command.widgets,
        widgetSettings: itemType.widgetSettings,
        allowedWidgetTypes: isAdmin ? ALL_WIDGET_TYPES : org.subscription.availableWidgetTypes,
        now,
      });
      if (isLeft(result)) return result;

      await this.itemRepository.save(tx, result.value.state);

      return Right(result.value.state);
    });
  }
}
