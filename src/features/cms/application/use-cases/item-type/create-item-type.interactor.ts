import { Inject, Injectable } from '@nestjs/common';

import { ItemTypeEntity } from '../../../domain/aggregates/item-type/entity.js';
import { ItemTypeEventPublisher, ItemTypeRepository } from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { TypeId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';
import type { WidgetType } from '@/kernel/domain/vo/widget.js';

@Injectable()
export class CreateItemTypeInteractor {
  public constructor(
    @Inject(ItemTypeRepository) private readonly itemTypeRepository: ItemTypeRepository,
    @Inject(ItemTypeEventPublisher) private readonly eventPublisher: ItemTypeEventPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: {
    id: TypeId;
    name: string;
    availableWidgetTypes: WidgetType[];
    requiredWidgetTypes: WidgetType[];
  }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageCms);
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const result = ItemTypeEntity.create({
        type: 'CreateItemType',
        id: command.id,
        name: command.name,
        availableWidgetTypes: command.availableWidgetTypes,
        requiredWidgetTypes: command.requiredWidgetTypes,
        now,
      });

      if (isLeft(result)) return result;

      const { state } = result.value;
      await this.itemTypeRepository.save(tx, state);

      await this.eventPublisher.publishItemTypeCreated(tx, {
        id: crypto.randomUUID(),
        type: 'item-type.created',
        typeId: state.id,
        name: state.name,
        availableWidgetTypes: state.availableWidgetTypes,
        requiredWidgetTypes: state.requiredWidgetTypes,
        createdAt: now,
      });

      return Right(state);
    });
  }
}
