import type { InfoDraftStatus } from '../aggregates/organization/entities/info-draft.entity.js';
import type { MediaId, OrganizationId } from '@/kernel/domain/ids.js';

export type MyOrganizationListItem = {
  id: OrganizationId;
  name: string;
  description: string;
  avatarId: MediaId | null;
  isOwner: boolean;
  isPublished: boolean;
  draftStatus: InfoDraftStatus;
  updatedAt: Date;
};

export type MyOrganizationsListReadModel = {
  organizations: MyOrganizationListItem[];
};
