import type { SubscriptionPlanId } from '../aggregates/organization/config.js';
import type { MediaId, OrganizationId } from '@/kernel/domain/ids.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';
import type { ContactLink, OrgTeam, WidgetType } from '@/kernel/domain/vo/widget.js';

export type OrganizationDetailReadModel = {
  id: OrganizationId;
  infoDraft: {
    name: string;
    description: string;
    avatarId: MediaId | null;
    media: MediaItem[];
    contacts: ContactLink[];
    team: OrgTeam;
    status: 'draft' | 'moderation-request' | 'rejected';
    updatedAt: Date;
    hasDraftChanges: boolean;
    canSubmitForModeration: boolean;
  };
  infoPublication: {
    name: string;
    description: string;
    avatarId: MediaId | null;
    media: MediaItem[];
    contacts: ContactLink[];
    team: OrgTeam;
    publishedAt: Date;
  } | null;
  subscription: {
    planId: SubscriptionPlanId;
    maxEmployees: number;
    maxPublishedItems: number;
    availableWidgetTypes: WidgetType[];
  };
  createdAt: Date;
  updatedAt: Date;
};
