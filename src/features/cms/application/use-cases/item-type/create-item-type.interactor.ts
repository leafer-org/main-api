import { Inject, Injectable } from '@nestjs/common';

import { ItemTypeEntity } from '../../../domain/aggregates/item-type/entity.js';
import { ItemTypeEventPublisher, ItemTypeRepository } from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { TypeId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';

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
    label: string;
    widgetSettings: WidgetSettings[];
  }) {
    const auth = await this.permissionCheck.mustCan(Permission.CmsItemTypeCreate);
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const result = ItemTypeEntity.create({
        type: 'CreateItemType',
        id: command.id,
        name: command.name,
        label: command.label,
        widgetSettings: command.widgetSettings,
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
        label: state.label,
        widgetSettings: state.widgetSettings,
        createdAt: now,
      });

      return Right(state);
    });
  }
}
