import type { OrganizationPublishedEvent } from '@/kernel/domain/events/organization.events.js';
import { type MediaId, OrganizationId } from '@/kernel/domain/ids.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';
import type { ContactLink, OrgTeam } from '@/kernel/domain/vo/widget.js';

/**
 * Read model владельца-организации. Хранится отдельно от товаров для независимого
 * обновления рейтинга и данных. Rating/reviewCount обновляются через review-события.
 */
export type OwnerReadModel = {
  ownerId: OrganizationId;
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  contacts: ContactLink[];
  team: OrgTeam | null;
  rating: number | null;
  reviewCount: number;
  updatedAt: Date;
};

export function projectOwnerFromOrganization(event: OrganizationPublishedEvent): OwnerReadModel {
  return {
    ownerId: OrganizationId.raw(event.organizationId),
    name: event.name,
    description: event.description,
    avatarId: event.avatarId,
    media: event.media,
    contacts: event.contacts,
    team: event.team,
    rating: null,
    reviewCount: 0,
    updatedAt: event.publishedAt,
  };
}
