import type { MediaId, OrganizationId, UserId } from '../ids.js';
import type { MediaItem } from '../vo/media-item.js';
import type { ContactLink, OrgTeam } from '../vo/widget.js';

/**
 * Тонкий сигнал «у пары (orgId, userId) могла измениться возможность отвечать
 * в чатах от лица орг». Подписчики (chat-проекция) при получении дёргают
 * OrganizationRespondabilityPort и пересчитывают свой стейт.
 *
 * Эмитится при: добавлении/удалении сотрудника, claim, изменении ролей/permission'ов.
 */
export type OrganizationRespondabilityChangedEvent = {
  id: string;
  type: 'organization.respondability-changed';
  organizationId: OrganizationId;
  userId: UserId;
  changedAt: Date;
};

export type OrganizationPublishedEvent = {
  id: string;
  type: 'organization.published';
  organizationId: OrganizationId;
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  contacts: ContactLink[];
  team: OrgTeam | null;
  republished: boolean;
  publishedAt: Date;
};

export type OrganizationUnpublishedEvent = {
  id: string;
  type: 'organization.unpublished';
  organizationId: OrganizationId;
  unpublishedAt: Date;
};

export type OrganizationModerationRequestedEvent = {
  id: string;
  type: 'organization.moderation-requested';
  organizationId: OrganizationId;
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  submittedAt: Date;
};

export type OrganizationIntegrationEvent =
  | OrganizationPublishedEvent
  | OrganizationUnpublishedEvent
  | OrganizationModerationRequestedEvent
  | OrganizationRespondabilityChangedEvent;
