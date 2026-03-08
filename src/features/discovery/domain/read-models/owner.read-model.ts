import type { OrganizationPublishedEvent } from '@/kernel/domain/events/organization.events.js';
import { type FileId, OrganizationId } from '@/kernel/domain/ids.js';

/**
 * Read model владельца-организации. Хранится отдельно от товаров для независимого
 * обновления рейтинга и данных. Rating/reviewCount обновляются через review-события.
 */
export type OwnerReadModel = {
  ownerId: OrganizationId;
  name: string;
  avatarId: FileId | null;
  rating: number | null;
  reviewCount: number;
  updatedAt: Date;
};

export function projectOwnerFromOrganization(event: OrganizationPublishedEvent): OwnerReadModel {
  return {
    ownerId: OrganizationId.raw(event.organizationId),
    name: event.name,
    avatarId: event.avatarId,
    rating: null,
    reviewCount: 0,
    updatedAt: event.publishedAt,
  };
}
