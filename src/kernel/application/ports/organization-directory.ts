import type { MediaId, OrganizationId, UserId } from '@/kernel/domain/ids.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';

export type OrganizationContact = {
  type: 'phone' | 'email' | 'link';
  value: string;
  label?: string;
};

export type OrganizationTeamMember = {
  name: string;
  description?: string;
  media: MediaItem[];
  employeeUserId?: UserId;
};

export type OrganizationTeam = {
  title: string;
  members: OrganizationTeamMember[];
};

/**
 * Снимок published-info организации. Если организация ещё не публиковалась,
 * `findById` вернёт `null` (для discovery нет смысла её показывать).
 */
export type OrganizationDirectoryView = {
  organizationId: OrganizationId;
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  contacts: OrganizationContact[];
  team: OrganizationTeam | null;
  publishedAt: Date;
  updatedAt: Date;
};

export abstract class OrganizationDirectoryPort {
  /** Возвращает published-снимок. Null если организация не опубликована. */
  public abstract findById(id: OrganizationId): Promise<OrganizationDirectoryView | null>;
  public abstract findByIds(
    ids: readonly OrganizationId[],
  ): Promise<OrganizationDirectoryView[]>;
  /** Сбрасывает in-memory cache адаптера. Зовётся consumer'ами `organization.changed`. */
  public abstract clearCache(): void;
}
