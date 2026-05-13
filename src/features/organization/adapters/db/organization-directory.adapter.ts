import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { OrganizationDatabaseClient } from './client.js';
import type { OrganizationJsonState } from './json-state.js';
import { organizations } from './schema.js';
import {
  type OrganizationContact,
  type OrganizationDirectoryView,
  OrganizationDirectoryPort,
  type OrganizationTeam,
} from '@/kernel/application/ports/organization-directory.js';
import { MediaId, OrganizationId, type UserId } from '@/kernel/domain/ids.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';

/**
 * TTL in-memory кеша. Организации меняются относительно редко, читаются часто
 * (item-list, search-suggestions, chat-preview). Инвалидация через `clearCache()`
 * по событию `organization.changed`.
 */
const CACHE_TTL_MS = 60_000;

type CacheEntry<T> = { value: T; expiresAt: number };

@Injectable()
export class DrizzleOrganizationDirectoryAdapter implements OrganizationDirectoryPort {
  private readonly byId = new Map<string, CacheEntry<OrganizationDirectoryView | null>>();

  public constructor(
    @Inject(OrganizationDatabaseClient)
    private readonly db: OrganizationDatabaseClient,
  ) {}

  public clearCache(): void {
    this.byId.clear();
  }

  public async findById(id: OrganizationId): Promise<OrganizationDirectoryView | null> {
    const key = id as string;
    const cached = this.readCache(key);
    if (cached !== undefined) return cached;

    const rows = await this.db
      .select({ state: organizations.state, updatedAt: organizations.updatedAt })
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    const row = rows[0];
    const view = row ? this.toView(row.state as OrganizationJsonState, row.updatedAt) : null;

    this.writeCache(key, view);
    return view;
  }

  public async findByIds(
    ids: readonly OrganizationId[],
  ): Promise<OrganizationDirectoryView[]> {
    if (ids.length === 0) return [];

    const rows = await this.db
      .select({ state: organizations.state, updatedAt: organizations.updatedAt })
      .from(organizations)
      .where(inArray(organizations.id, ids as OrganizationId[]));

    return rows
      .map((r) => this.toView(r.state as OrganizationJsonState, r.updatedAt))
      .filter((v): v is OrganizationDirectoryView => v !== null);
  }

  private toView(
    state: OrganizationJsonState,
    updatedAt: Date,
  ): OrganizationDirectoryView | null {
    const pub = state.infoPublication;
    if (!pub) return null;

    return {
      organizationId: OrganizationId.raw(state.id),
      name: pub.name,
      description: pub.description,
      avatarId: pub.avatarId ? MediaId.raw(pub.avatarId) : null,
      media: (pub.media ?? []).map<MediaItem>((m) => ({
        type: m.type as MediaItem['type'],
        mediaId: MediaId.raw(m.mediaId),
      })),
      contacts: (pub.contacts ?? []).map<OrganizationContact>((c) => ({
        type: c.type as OrganizationContact['type'],
        value: c.value,
        ...(c.label !== undefined ? { label: c.label } : {}),
      })),
      team: pub.team
        ? ({
            title: pub.team.title,
            members: pub.team.members.map((m) => ({
              name: m.name,
              ...(m.description !== undefined ? { description: m.description } : {}),
              media: m.media.map<MediaItem>((mm) => ({
                type: mm.type as MediaItem['type'],
                mediaId: MediaId.raw(mm.mediaId),
              })),
              ...(m.employeeUserId !== undefined
                ? { employeeUserId: m.employeeUserId as UserId }
                : {}),
            })),
          } satisfies OrganizationTeam)
        : null,
      publishedAt: new Date(pub.publishedAt),
      updatedAt,
    };
  }

  private readCache(key: string): OrganizationDirectoryView | null | undefined {
    const entry = this.byId.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.byId.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private writeCache(key: string, value: OrganizationDirectoryView | null): void {
    this.byId.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }
}
