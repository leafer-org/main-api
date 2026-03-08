import type { OrganizationEntity } from '../domain/aggregates/organization/entity.js';
import type { ItemEntity } from '../domain/aggregates/item/entity.js';
import type { OrganizationDetailReadModel } from '../domain/read-models/organization-detail.read-model.js';
import type { EmployeeListReadModel } from '../domain/read-models/employee-list.read-model.js';
import type { EmployeeRoleListReadModel } from '../domain/read-models/employee-role-list.read-model.js';
import type { ItemListReadModel } from '../domain/read-models/item-list.read-model.js';
import type { ItemDetailReadModel } from '../domain/read-models/item-detail.read-model.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type {
  OrganizationPublishedEvent,
  OrganizationUnpublishedEvent,
  OrganizationModerationRequestedEvent,
} from '@/kernel/domain/events/organization.events.js';
import type {
  ItemPublishedEvent,
  ItemUnpublishedEvent,
  ItemModerationRequestedEvent,
} from '@/kernel/domain/events/item.events.js';
import type { ItemId, OrganizationId } from '@/kernel/domain/ids.js';

// --- Organization repository ---

export abstract class OrganizationRepository {
  public abstract findById(
    tx: Transaction,
    id: OrganizationId,
  ): Promise<OrganizationEntity | null>;

  public abstract save(tx: Transaction, state: OrganizationEntity): Promise<void>;
}

// --- Item repository ---

export abstract class ItemRepository {
  public abstract findById(tx: Transaction, itemId: ItemId): Promise<ItemEntity | null>;

  public abstract findPublishedByOrganizationId(
    tx: Transaction,
    orgId: OrganizationId,
  ): Promise<ItemEntity[]>;

  public abstract countPublishedByOrganizationId(
    tx: Transaction,
    orgId: OrganizationId,
  ): Promise<number>;

  public abstract save(tx: Transaction, state: ItemEntity): Promise<void>;

  public abstract delete(tx: Transaction, itemId: ItemId): Promise<void>;
}

// --- Event publisher ports ---

export abstract class OrganizationEventPublisher {
  public abstract publishOrganizationPublished(
    tx: Transaction,
    event: OrganizationPublishedEvent,
  ): Promise<void>;

  public abstract publishOrganizationUnpublished(
    tx: Transaction,
    event: OrganizationUnpublishedEvent,
  ): Promise<void>;

  public abstract publishModerationRequested(
    tx: Transaction,
    event: OrganizationModerationRequestedEvent,
  ): Promise<void>;
}

export abstract class ItemEventPublisher {
  public abstract publishItemPublished(
    tx: Transaction,
    event: ItemPublishedEvent,
  ): Promise<void>;

  public abstract publishItemUnpublished(
    tx: Transaction,
    event: ItemUnpublishedEvent,
  ): Promise<void>;

  public abstract publishModerationRequested(
    tx: Transaction,
    event: ItemModerationRequestedEvent,
  ): Promise<void>;
}

// --- Query ports ---

export abstract class OrganizationQueryPort {
  public abstract findDetail(id: OrganizationId): Promise<OrganizationDetailReadModel | null>;
  public abstract findEmployees(id: OrganizationId): Promise<EmployeeListReadModel>;
  public abstract findRoles(id: OrganizationId): Promise<EmployeeRoleListReadModel>;
}

export abstract class ItemQueryPort {
  public abstract findByOrganizationId(orgId: OrganizationId): Promise<ItemListReadModel>;
  public abstract findDetail(itemId: ItemId): Promise<ItemDetailReadModel | null>;
}
