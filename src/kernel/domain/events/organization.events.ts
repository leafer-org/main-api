import type { FileId, OrganizationId } from '../ids.js';

export type OrganizationPublishedEvent = {
  id: string;
  type: 'organization.published';
  organizationId: OrganizationId;
  name: string;
  avatarId: FileId | null;
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
  avatarId: FileId | null;
  submittedAt: Date;
};

export type OrganizationIntegrationEvent =
  | OrganizationPublishedEvent
  | OrganizationUnpublishedEvent
  | OrganizationModerationRequestedEvent;
