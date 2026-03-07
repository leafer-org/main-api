import type { FileId, OrganizationId } from '../ids.js';

export type OrganizationPublishedEvent = {
  type: 'organization.published';
  organizationId: OrganizationId;
  name: string;
  avatarId: FileId | null;
  republished: boolean;
  publishedAt: Date;
};

export type OrganizationUnpublishedEvent = {
  type: 'organization.unpublished';
  organizationId: OrganizationId;
  unpublishedAt: Date;
};

export type OrganizationIntegrationEvent =
  | OrganizationPublishedEvent
  | OrganizationUnpublishedEvent;
