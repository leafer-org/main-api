import { Inject, Injectable } from '@nestjs/common';

import { ItemTypeEntity } from '../../../domain/aggregates/item-type/entity.js';
import { ItemTypeNotFoundError } from '../../../domain/aggregates/item-type/errors.js';
import { ItemTypeEventPublisher, ItemTypeRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { TypeId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';

@Injectable()
export class UpdateItemTypeInteractor {
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
    widgetSettings: WidgetSettings[];
  }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageCms);
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.itemTypeRepository.findById(tx, command.id);
      if (!state) return Left(new ItemTypeNotFoundError());

      const result = ItemTypeEntity.update(state, {
        type: 'UpdateItemType',
        name: command.name,
        widgetSettings: command.widgetSettings,
        now,
      });

      if (isLeft(result)) return result;

      const { state: newState } = result.value;
      await this.itemTypeRepository.save(tx, newState);

      await this.eventPublisher.publishItemTypeUpdated(tx, {
        id: crypto.randomUUID(),
        type: 'item-type.updated',
        typeId: newState.id,
        name: newState.name,
        widgetSettings: newState.widgetSettings,
        updatedAt: now,
      });

      return Right(newState);
    });
  }
}
