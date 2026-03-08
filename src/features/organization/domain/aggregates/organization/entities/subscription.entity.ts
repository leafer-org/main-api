import { SUBSCRIPTION_PLANS, type SubscriptionPlanId } from '../config.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import type { WidgetType } from '@/kernel/domain/vo/widget.js';

export type SubscriptionEntity = EntityState<{
  planId: SubscriptionPlanId;
  maxEmployees: number;
  maxPublishedItems: number;
  availableWidgetTypes: WidgetType[];
}>;

export const SubscriptionEntity = {
  fromPlan(planId: SubscriptionPlanId): SubscriptionEntity {
    const plan = SUBSCRIPTION_PLANS[planId];
    return {
      planId,
      maxEmployees: plan.maxEmployees,
      maxPublishedItems: plan.maxPublishedItems,
      availableWidgetTypes: [...plan.availableWidgetTypes],
    };
  },

  change(planId: SubscriptionPlanId): SubscriptionEntity {
    return SubscriptionEntity.fromPlan(planId);
  },
};
