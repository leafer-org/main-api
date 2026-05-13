import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { OrganizationDatabaseClient } from './client.js';
import type { ItemJsonState } from './json-state.js';
import { items } from './schema.js';
import {
  type ItemDirectoryView,
  ItemDirectoryPort,
} from '@/kernel/application/ports/item-directory.js';
import { ItemId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';
import type { ItemWidget } from '@/kernel/domain/vo/widget.js';

const CACHE_TTL_MS = 60_000;

type CacheEntry<T> = { value: T; expiresAt: number };

@Injectable()
export class DrizzleItemDirectoryAdapter implements ItemDirectoryPort {
  private readonly byId = new Map<string, CacheEntry<ItemDirectoryView | null>>();

  public constructor(
    @Inject(OrganizationDatabaseClient)
    private readonly db: OrganizationDatabaseClient,
  ) {}

  public clearCache(): void {
    this.byId.clear();
  }

  public async findById(id: ItemId): Promise<ItemDirectoryView | null> {
    const key = id as string;
    const cached = this.readCache(key);
    if (cached !== undefined) return cached;

    const rows = await this.db
      .select({
        state: items.state,
        organizationId: items.organizationId,
        typeId: items.typeId,
        updatedAt: items.updatedAt,
      })
      .from(items)
      .where(eq(items.id, id))
      .limit(1);

    const row = rows[0];
    const view = row
      ? this.toView(
          row.state as ItemJsonState,
          row.organizationId,
          row.typeId,
          row.updatedAt,
        )
      : null;

    this.writeCache(key, view);
    return view;
  }

  public async findByIds(ids: readonly ItemId[]): Promise<ItemDirectoryView[]> {
    if (ids.length === 0) return [];

    const rows = await this.db
      .select({
        state: items.state,
        organizationId: items.organizationId,
        typeId: items.typeId,
        updatedAt: items.updatedAt,
      })
      .from(items)
      .where(inArray(items.id, ids as ItemId[]));

    return rows
      .map((r) =>
        this.toView(r.state as ItemJsonState, r.organizationId, r.typeId, r.updatedAt),
      )
      .filter((v): v is ItemDirectoryView => v !== null);
  }

  private toView(
    state: ItemJsonState,
    organizationId: string,
    typeId: string,
    updatedAt: Date,
  ): ItemDirectoryView | null {
    const pub = state.publication;
    if (!pub) return null;

    return {
      itemId: ItemId.raw(state.itemId),
      organizationId: OrganizationId.raw(organizationId),
      typeId: TypeId.raw(typeId),
      widgets: pub.widgets as ItemWidget[],
      publishedAt: new Date(pub.publishedAt),
      updatedAt,
    };
  }

  private readCache(key: string): ItemDirectoryView | null | undefined {
    const entry = this.byId.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.byId.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private writeCache(key: string, value: ItemDirectoryView | null): void {
    this.byId.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }
}
