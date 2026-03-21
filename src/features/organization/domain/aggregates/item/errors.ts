import { CreateDomainError } from '@/infra/ddd/error.js';
import type { PaymentStrategy, WidgetType } from '@/kernel/domain/vo/widget.js';

export class ItemNotFoundError extends CreateDomainError('item_not_found', 404) {}

export class ItemNoDraftError extends CreateDomainError('item_no_draft', 400) {}

export class ItemNoPublicationError extends CreateDomainError('item_no_publication', 400) {}

export class ItemDraftInModerationError extends CreateDomainError(
  'item_draft_in_moderation',
  400,
) {}

export class ItemDraftNotInModerationError extends CreateDomainError(
  'item_draft_not_in_moderation',
  400,
) {}

export class MissingRequiredWidgetsError extends CreateDomainError(
  'missing_required_widgets',
  400,
).withData<{ missing: WidgetType[] }>() {}

export class InvalidWidgetTypesError extends CreateDomainError(
  'invalid_widget_types',
  400,
).withData<{ invalid: WidgetType[] }>() {}

export class WidgetNotAllowedByPlanError extends CreateDomainError(
  'widget_not_allowed_by_plan',
  403,
).withData<{ disallowed: WidgetType[] }>() {}

export class PublishedItemLimitReachedError extends CreateDomainError(
  'published_item_limit_reached',
  400,
) {}

export class VideoNotReadyForModerationError extends CreateDomainError(
  'video_not_ready_for_moderation',
  400,
) {}

export class InvalidPaymentStrategyError extends CreateDomainError(
  'invalid_payment_strategy',
  400,
).withData<{ strategy: PaymentStrategy; allowed: PaymentStrategy[] }>() {}

export class EventDateTimeLimitExceededError extends CreateDomainError(
  'event_date_time_limit_exceeded',
  400,
).withData<{ count: number; maxDates: number }>() {}
