import type { SubscriptionPlanId } from '../aggregates/organization/config.js';
import type { FileId, OrganizationId } from '@/kernel/domain/ids.js';
import type { WidgetType } from '@/kernel/domain/vo/widget.js';

export type OrganizationDetailReadModel = {
  id: OrganizationId;
  infoDraft: {
    name: string;
    description: string;
    avatarId: FileId | null;
    status: 'draft' | 'moderation-request' | 'rejected';
  };
  infoPublication: {
    name: string;
    description: string;
    avatarId: FileId | null;
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
