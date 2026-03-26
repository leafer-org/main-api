import type { ItemEntity } from '../domain/aggregates/item/entity.js';
import type { OrganizationEntity } from '../domain/aggregates/organization/entity.js';
import type { AdminOrganizationsListReadModel } from '../domain/read-models/admin-organizations-list.read-model.js';
import type { EmployeeListReadModel } from '../domain/read-models/employee-list.read-model.js';
import type { EmployeeRoleListReadModel } from '../domain/read-models/employee-role-list.read-model.js';
import type { ItemDetailReadModel } from '../domain/read-models/item-detail.read-model.js';
import type { ItemListQuery, ItemListReadModel } from '../domain/read-models/item-list.read-model.js';
import type { OrganizationDetailReadModel } from '../domain/read-models/organization-detail.read-model.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type {
  ItemModerationRequestedEvent,
  ItemPublishedEvent,
  ItemUnpublishedEvent,
} from '@/kernel/domain/events/item.events.js';
import type {
  OrganizationModerationRequestedEvent,
  OrganizationPublishedEvent,
  OrganizationUnpublishedEvent,
} from '@/kernel/domain/events/organization.events.js';
import type { ItemId, OrganizationId } from '@/kernel/domain/ids.js';

// --- Organization repository ---

export abstract class OrganizationRepository {
  public abstract findById(tx: Transaction, id: OrganizationId): Promise<OrganizationEntity | null>;

  public abstract save(tx: Transaction, state: OrganizationEntity): Promise<void>;

  public abstract delete(tx: Transaction, id: OrganizationId): Promise<void>;
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

  public abstract deleteByOrganizationId(tx: Transaction, orgId: OrganizationId): Promise<void>;
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
  public abstract publishItemPublished(tx: Transaction, event: ItemPublishedEvent): Promise<void>;

  public abstract publishItemUnpublished(
    tx: Transaction,
    event: ItemUnpublishedEvent,
  ): Promise<void>;

  public abstract publishModerationRequested(
    tx: Transaction,
    event: ItemModerationRequestedEvent,
  ): Promise<void>;
}

// --- Moderation result publisher ---

export type ModerationResultEvent = {
  id: string;
  type: 'moderation.approved' | 'moderation.rejected';
  entityType: 'organization' | 'item';
  entityId: string;
};

export abstract class ModerationResultPublisher {
  public abstract publish(tx: Transaction, event: ModerationResultEvent): Promise<void>;
}

// --- Claim token query port ---

export abstract class ClaimTokenQueryPort {
  public abstract findOrganizationByClaimToken(
    tx: Transaction,
    token: string,
  ): Promise<OrganizationEntity | null>;
}

// --- Query ports ---

export abstract class OrganizationQueryPort {
  public abstract findDetail(id: OrganizationId): Promise<OrganizationDetailReadModel | null>;
  public abstract findEmployees(id: OrganizationId): Promise<EmployeeListReadModel>;
  public abstract findRoles(id: OrganizationId): Promise<EmployeeRoleListReadModel>;
  public abstract findClaimToken(id: OrganizationId): Promise<string | null>;
}

export abstract class ItemQueryPort {
  public abstract findList(query: ItemListQuery): Promise<ItemListReadModel>;
  public abstract findDetail(itemId: ItemId): Promise<ItemDetailReadModel | null>;
}

// --- Search read-model ports (Meilisearch, no transactions) ---

export abstract class AdminOrganizationsListRepository {
  public abstract saveBatch(models: AdminOrganizationsListReadModel[]): Promise<void>;
  public abstract deleteById(organizationId: string): Promise<void>;
}

export abstract class AdminOrganizationsListQueryPort {
  public abstract search(params: {
    query?: string;
    status?: string;
    from?: number;
    size?: number;
  }): Promise<{ organizations: AdminOrganizationsListReadModel[]; total: number }>;
}
