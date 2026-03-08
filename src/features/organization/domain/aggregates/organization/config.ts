import type { WidgetType } from '@/kernel/domain/vo/widget.js';

export type SubscriptionPlanId = 'free' | 'individual' | 'team';

export type OrganizationPermission =
  | 'manage_employees'
  | 'manage_roles'
  | 'edit_organization'
  | 'publish_organization'
  | 'edit_items'
  | 'publish_items'
  | 'unpublish_items'
  | 'manage_subscription';

export const ALL_PERMISSIONS: OrganizationPermission[] = [
  'manage_employees',
  'manage_roles',
  'edit_organization',
  'publish_organization',
  'edit_items',
  'publish_items',
  'unpublish_items',
  'manage_subscription',
];

export const ADMIN_ROLE_NAME = 'ADMIN';

export type SubscriptionPlanConfig = {
  maxEmployees: number;
  maxPublishedItems: number;
  availableWidgetTypes: WidgetType[];
};

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlanConfig> = {
  free: {
    maxEmployees: 1,
    maxPublishedItems: 3,
    availableWidgetTypes: ['base-info', 'age-group', 'location', 'payment', 'category', 'owner'],
  },
  individual: {
    maxEmployees: 1,
    maxPublishedItems: 20,
    availableWidgetTypes: [
      'base-info',
      'age-group',
      'location',
      'payment',
      'category',
      'owner',
      'schedule',
      'item-review',
      'owner-review',
      'event-date-time',
    ],
  },
  team: {
    maxEmployees: 50,
    maxPublishedItems: 100,
    availableWidgetTypes: [
      'base-info',
      'age-group',
      'location',
      'payment',
      'category',
      'owner',
      'schedule',
      'item-review',
      'owner-review',
      'event-date-time',
    ],
  },
};
