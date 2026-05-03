import type { MediaId, OrganizationId } from '@/kernel/domain/ids.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';
import type { ContactLink, OrgTeam } from '@/kernel/domain/vo/widget.js';

/**
 * Публичный профиль организации в discovery-выдаче.
 * Источник — `discovery_owners` (проекция от organization.streaming + reviews).
 */
export type OrganizationProfileReadModel = {
  organizationId: OrganizationId;
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  contacts: ContactLink[];
  team: OrgTeam | null;
  rating: number | null;
  reviewCount: number;
};
