import { Inject, Injectable } from '@nestjs/common';

import { ItemEntity } from '../../../domain/aggregates/item/entity.js';
import { OrganizationNotFoundError } from '../../../domain/aggregates/organization/errors.js';
import { ItemRepository, OrganizationRepository } from '../../ports.js';
import { CreateDomainError } from '@/infra/ddd/error.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { CatalogValidationPort } from '@/kernel/application/ports/catalog-validation.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ItemId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';
import type { ItemWidget, WidgetType } from '@/kernel/domain/vo/widget.js';

export class ItemTypeNotFoundError extends CreateDomainError('item_type_not_found', 404) {}

const ALL_WIDGET_TYPES: WidgetType[] = [
  'base-info',
  'age-group',
  'location',
  'payment',
  'category',
  'owner',
  'item-review',
  'owner-review',
  'event-date-time',
  'schedule',
];

@Injectable()
export class AdminCreateItemInteractor {
  public constructor(
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
    @Inject(ItemRepository) private readonly itemRepository: ItemRepository,
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(CatalogValidationPort) private readonly catalogValidation: CatalogValidationPort,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: {
    organizationId: OrganizationId;
    itemId: ItemId;
    typeId: TypeId;
    widgets: ItemWidget[];
  }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageOrganization);
    if (isLeft(auth)) return auth;

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
        availableWidgetTypes: itemType.availableWidgetTypes,
        requiredWidgetTypes: itemType.requiredWidgetTypes,
        allowedWidgetTypes: ALL_WIDGET_TYPES,
        now,
      });
      if (isLeft(result)) return result;

      await this.itemRepository.save(tx, result.value.state);

      return Right(result.value.state);
    });
  }
}
