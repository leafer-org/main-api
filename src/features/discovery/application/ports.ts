import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { AttributeId, CategoryId, ServiceId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo.js';
import type { ServiceListingReadModel } from '../domain/read-models/service-listing/service-listing.read-model.js';
import type { AttributeReadModel } from '../domain/read-models/attribute.read-model.js';

// ─── Write-side (projection handlers) ───────────────────────────────────────

export abstract class ServiceListingRepository {
  public abstract findByServiceId(
    tx: Transaction,
    serviceId: ServiceId,
  ): Promise<ServiceListingReadModel | null>;

  public abstract save(tx: Transaction, model: ServiceListingReadModel): Promise<void>;

  public abstract deleteByServiceId(tx: Transaction, serviceId: ServiceId): Promise<void>;
}

export abstract class AttributeRepository {
  public abstract findByAttributeId(
    tx: Transaction,
    attributeId: AttributeId,
  ): Promise<AttributeReadModel | null>;

  public abstract save(tx: Transaction, model: AttributeReadModel): Promise<void>;

  public abstract deleteByAttributeId(tx: Transaction, attributeId: AttributeId): Promise<void>;
}

// ─── Read-side (query interactors) ──────────────────────────────────────────

export type PaginatedResult<T> = {
  items: T[];
  nextCursor: string | null;
};

export abstract class ServiceFeedQueryPort {
  public abstract findFeed(params: {
    cursor?: string;
    limit: number;
    ageGroup?: AgeGroup;
    categoryId?: CategoryId;
  }): Promise<PaginatedResult<ServiceListingReadModel>>;
}

export abstract class ServiceSearchQueryPort {
  public abstract search(params: {
    query?: string;
    categoryId?: CategoryId;
    ageGroup?: AgeGroup;
    cursor?: string;
    limit: number;
  }): Promise<PaginatedResult<ServiceListingReadModel>>;
}

export abstract class ServiceDetailQueryPort {
  public abstract findByServiceId(
    serviceId: ServiceId,
  ): Promise<ServiceListingReadModel | null>;
}
