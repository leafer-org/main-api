import type {
  ApproveItemModerationCommand,
  CreateItemCommand,
  DeleteDraftCommand,
  RejectItemModerationCommand,
  SubmitItemForModerationCommand,
  UnpublishItemCommand,
  UpdateDraftCommand,
} from './commands.js';
import {
  EventDateTimeLimitExceededError,
  InvalidPaymentStrategyError,
  InvalidWidgetTypesError,
  ItemDraftInModerationError,
  ItemDraftNotInModerationError,
  ItemNoDraftError,
  ItemNoPublicationError,
  MissingRequiredWidgetsError,
  WidgetNotAllowedByPlanError,
} from './errors.js';
import type {
  ItemCreatedEvent,
  ItemDraftDeletedEvent,
  ItemDraftUpdatedEvent,
  ItemModerationApprovedEvent,
  ItemModerationRejectedEvent,
  ItemSubmittedForModerationEvent,
  ItemUnpublishedInternalEvent,
} from './events.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import type { ItemId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';
import {
  findWidgetSettings,
  getAvailableWidgetTypes,
  getRequiredWidgetTypes,
  type WidgetSettings,
} from '@/kernel/domain/vo/widget-settings.js';
import type { ItemWidget, WidgetType } from '@/kernel/domain/vo/widget.js';

// --- Sub-types ---

export type DraftStatus = 'draft' | 'moderation-request' | 'rejected';

// --- Entity State ---

export type ItemEntity = EntityState<{
  itemId: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;

  draft: {
    widgets: ItemWidget[];
    status: DraftStatus;
    updatedAt: Date;
  } | null;

  publication: {
    widgets: ItemWidget[];
    publishedAt: Date;
  } | null;

  createdAt: Date;
  updatedAt: Date;
}>;

// --- Widget validation ---

type WidgetValidationError =
  | InvalidWidgetTypesError
  | MissingRequiredWidgetsError
  | WidgetNotAllowedByPlanError
  | InvalidPaymentStrategyError
  | EventDateTimeLimitExceededError;

function validateWidgets(
  widgets: ItemWidget[],
  widgetSettings: WidgetSettings[],
  allowedWidgetTypes: WidgetType[],
): Either<WidgetValidationError, void> {
  const widgetTypes = widgets.map((w) => w.type);
  const widgetTypeSet = new Set(widgetTypes);

  const requiredWidgetTypes = getRequiredWidgetTypes(widgetSettings);
  const availableWidgetTypes = getAvailableWidgetTypes(widgetSettings);

  // Check required widgets
  const missing = requiredWidgetTypes.filter((t) => !widgetTypeSet.has(t));
  if (missing.length > 0) return Left(new MissingRequiredWidgetsError({ missing }));

  // Check available widget types (for this item type)
  const availableSet = new Set(availableWidgetTypes);
  const invalid = widgetTypes.filter((t) => !availableSet.has(t));
  if (invalid.length > 0) return Left(new InvalidWidgetTypesError({ invalid }));

  // Check allowed by subscription plan
  const allowedSet = new Set(allowedWidgetTypes);
  const disallowed = widgetTypes.filter((t) => !allowedSet.has(t));
  if (disallowed.length > 0) return Left(new WidgetNotAllowedByPlanError({ disallowed }));

  // Widget-specific validation
  for (const widget of widgets) {
    if (widget.type === 'payment') {
      const settings = findWidgetSettings(widgetSettings, 'payment');
      if (settings && !settings.allowedStrategies.includes(widget.strategy)) {
        return Left(
          new InvalidPaymentStrategyError({
            strategy: widget.strategy,
            allowed: settings.allowedStrategies,
          }),
        );
      }
    }

    if (widget.type === 'event-date-time') {
      const settings = findWidgetSettings(widgetSettings, 'event-date-time');
      if (settings?.maxDates !== null && settings?.maxDates !== undefined) {
        if (widget.dates.length > settings.maxDates) {
          return Left(
            new EventDateTimeLimitExceededError({
              count: widget.dates.length,
              maxDates: settings.maxDates,
            }),
          );
        }
      }
    }
  }

  return Right(undefined);
}

// --- Entity ---

export const ItemEntity = {
  create(
    cmd: CreateItemCommand,
  ): Either<WidgetValidationError, { state: ItemEntity; event: ItemCreatedEvent }> {
    const validation = validateWidgets(cmd.widgets, cmd.widgetSettings, cmd.allowedWidgetTypes);
    if (isLeft(validation)) return validation;

    const event: ItemCreatedEvent = {
      type: 'item.created',
      itemId: cmd.itemId,
      organizationId: cmd.organizationId,
      typeId: cmd.typeId,
      widgets: cmd.widgets,
      createdAt: cmd.now,
    };

    const state: ItemEntity = {
      itemId: event.itemId,
      organizationId: event.organizationId,
      typeId: event.typeId,
      draft: {
        widgets: event.widgets,
        status: 'draft',
        updatedAt: event.createdAt,
      },
      publication: null,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    };

    return Right({ state, event });
  },

  updateDraft(
    state: ItemEntity,
    cmd: UpdateDraftCommand,
  ): Either<
    | ItemNoDraftError
    | ItemDraftInModerationError
    | WidgetValidationError,
    { state: ItemEntity; event: ItemDraftUpdatedEvent }
  > {
    if (!state.draft) return Left(new ItemNoDraftError());
    if (state.draft.status === 'moderation-request') return Left(new ItemDraftInModerationError());

    const validation = validateWidgets(cmd.widgets, cmd.widgetSettings, cmd.allowedWidgetTypes);
    if (isLeft(validation)) return validation;

    const event: ItemDraftUpdatedEvent = {
      type: 'item.draft-updated',
      itemId: state.itemId,
      widgets: cmd.widgets,
      updatedAt: cmd.now,
    };

    const newState: ItemEntity = {
      ...state,
      draft: {
        widgets: event.widgets,
        status: state.draft.status,
        updatedAt: event.updatedAt,
      },
      updatedAt: cmd.now,
    };

    return Right({ state: newState, event });
  },

  deleteDraft(
    state: ItemEntity,
    cmd: DeleteDraftCommand,
  ): Either<ItemNoDraftError, { state: ItemEntity | null; event: ItemDraftDeletedEvent }> {
    if (!state.draft) return Left(new ItemNoDraftError());

    const event: ItemDraftDeletedEvent = {
      type: 'item.draft-deleted',
      itemId: state.itemId,
      deletedAt: cmd.now,
    };

    // If no publication, entire item is deleted
    if (!state.publication) {
      return Right({ state: null, event });
    }

    const newState: ItemEntity = {
      ...state,
      draft: null,
      updatedAt: cmd.now,
    };

    return Right({ state: newState, event });
  },

  submitForModeration(
    state: ItemEntity,
    cmd: SubmitItemForModerationCommand,
  ): Either<
    ItemNoDraftError | ItemDraftInModerationError,
    { state: ItemEntity; event: ItemSubmittedForModerationEvent }
  > {
    if (!state.draft) return Left(new ItemNoDraftError());
    if (state.draft.status === 'moderation-request') return Left(new ItemDraftInModerationError());

    const event: ItemSubmittedForModerationEvent = {
      type: 'item.submitted-for-moderation',
      itemId: state.itemId,
      organizationId: state.organizationId,
      typeId: state.typeId,
      widgets: state.draft.widgets,
      submittedAt: cmd.now,
    };

    const newState: ItemEntity = {
      ...state,
      draft: {
        ...state.draft,
        status: 'moderation-request',
      },
      updatedAt: cmd.now,
    };

    return Right({ state: newState, event });
  },

  approveModeration(
    state: ItemEntity,
    cmd: ApproveItemModerationCommand,
  ): Either<
    ItemNoDraftError | ItemDraftNotInModerationError,
    { state: ItemEntity; event: ItemModerationApprovedEvent }
  > {
    if (!state.draft) return Left(new ItemNoDraftError());
    if (state.draft.status !== 'moderation-request') {
      return Left(new ItemDraftNotInModerationError());
    }

    const republished = state.publication !== null;

    const event: ItemModerationApprovedEvent = {
      type: 'item.moderation-approved',
      eventId: cmd.eventId,
      itemId: state.itemId,
      organizationId: state.organizationId,
      typeId: state.typeId,
      widgets: state.draft.widgets,
      republished,
      publishedAt: cmd.now,
    };

    const newState: ItemEntity = {
      ...state,
      draft: null,
      publication: {
        widgets: event.widgets,
        publishedAt: event.publishedAt,
      },
      updatedAt: cmd.now,
    };

    return Right({ state: newState, event });
  },

  rejectModeration(
    state: ItemEntity,
    cmd: RejectItemModerationCommand,
  ): Either<
    ItemNoDraftError | ItemDraftNotInModerationError,
    { state: ItemEntity; event: ItemModerationRejectedEvent }
  > {
    if (!state.draft) return Left(new ItemNoDraftError());
    if (state.draft.status !== 'moderation-request') {
      return Left(new ItemDraftNotInModerationError());
    }

    const event: ItemModerationRejectedEvent = {
      type: 'item.moderation-rejected',
      itemId: state.itemId,
      rejectedAt: cmd.now,
    };

    const newState: ItemEntity = {
      ...state,
      draft: {
        ...state.draft,
        status: 'rejected',
      },
      updatedAt: cmd.now,
    };

    return Right({ state: newState, event });
  },

  unpublish(
    state: ItemEntity,
    cmd: UnpublishItemCommand,
  ): Either<ItemNoPublicationError, { state: ItemEntity; event: ItemUnpublishedInternalEvent }> {
    if (!state.publication) return Left(new ItemNoPublicationError());

    const event: ItemUnpublishedInternalEvent = {
      type: 'item.unpublished-internal',
      eventId: cmd.eventId,
      itemId: state.itemId,
      widgets: state.publication.widgets,
      unpublishedAt: cmd.now,
    };

    const newState: ItemEntity = {
      ...state,
      draft: {
        widgets: state.publication.widgets,
        status: 'draft',
        updatedAt: cmd.now,
      },
      publication: null,
      updatedAt: cmd.now,
    };

    return Right({ state: newState, event });
  },
};
