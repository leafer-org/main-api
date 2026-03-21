import { Injectable } from '@nestjs/common';

import { ItemTypeProjectionPort } from '../../../application/projection-ports.js';
import type { ItemTypeReadModel } from '../../../domain/read-models/item-type.read-model.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryItemTypes } from '../schema.js';

@Injectable()
export class DrizzleItemTypeProjectionRepository implements ItemTypeProjectionPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async upsert(itemType: ItemTypeReadModel): Promise<void> {
    await this.dbClient.db
      .insert(discoveryItemTypes)
      .values({
        id: itemType.typeId as string,
        name: itemType.name,
        widgetSettings: itemType.widgetSettings,
        createdAt: itemType.createdAt,
        updatedAt: itemType.updatedAt,
      })
      .onConflictDoUpdate({
        target: discoveryItemTypes.id,
        set: {
          name: itemType.name,
          widgetSettings: itemType.widgetSettings,
          updatedAt: itemType.updatedAt,
        },
      });
  }
}
