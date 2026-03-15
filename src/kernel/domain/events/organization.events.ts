import type { MediaId, OrganizationId } from '../ids.js';
import type { MediaItem } from '../vo/media-item.js';

export type OrganizationPublishedEvent = {
  id: string;
  type: 'organization.published';
  organizationId: OrganizationId;
  name: string;
  avatarId: MediaId | null;
  media: MediaItem[];
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
  | OrganizationModerationRequestedEvent;
