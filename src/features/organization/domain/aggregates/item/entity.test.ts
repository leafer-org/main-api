import { describe, expect, it } from 'vitest';

import { ItemEntity } from './entity.js';
import { isLeft } from '@/infra/lib/box.js';
import { ItemId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';
import type { ItemWidget, WidgetType } from '@/kernel/domain/vo/widget.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const ITEM_ID = ItemId.raw('item-1');
const ORG_ID = OrganizationId.raw('org-1');
const TYPE_ID = TypeId.raw('type-1');
const NOW = new Date('2024-06-01T12:00:00.000Z');
const LATER = new Date('2024-06-02T12:00:00.000Z');

const BASE_WIDGET: ItemWidget = {
  type: 'base-info',
  title: 'Test Item',
  description: 'Description',
  media: [],
};

const OWNER_WIDGET: ItemWidget = {
  type: 'owner',
  organizationId: ORG_ID,
  name: 'Test Org',
  avatarId: null,
};

const WIDGETS: ItemWidget[] = [BASE_WIDGET, OWNER_WIDGET];

const WIDGET_SETTINGS: WidgetSettings[] = [
  { type: 'base-info', required: true },
  { type: 'owner', required: true },
  { type: 'age-group', required: false },
  { type: 'location', required: false },
];

const ALLOWED: WidgetType[] = [
  'base-info',
  'owner',
  'age-group',
  'location',
  'payment',
  'category',
];

function createItem() {
  const result = ItemEntity.create({
    type: 'CreateItem',
    itemId: ITEM_ID,
    organizationId: ORG_ID,
    typeId: TYPE_ID,
    widgets: WIDGETS,
    widgetSettings: WIDGET_SETTINGS,
    allowedWidgetTypes: ALLOWED,
    now: NOW,
  });
  if (isLeft(result)) throw new Error('Expected Right');
  return result.value.state;
}

function itemInModeration() {
  const state = createItem();
  const r = ItemEntity.submitForModeration(state, { type: 'SubmitItemForModeration', now: NOW });
  if (isLeft(r)) throw new Error('Expected Right');
  return r.value.state;
}

function publishedItem() {
  const state = itemInModeration();
  const r = ItemEntity.approveModeration(state, {
    type: 'ApproveItemModeration',
    eventId: 'evt-1',
    now: NOW,
  });
  if (isLeft(r)) throw new Error('Expected Right');
  return r.value.state;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ItemEntity', () => {
  describe('create', () => {
    it('creates item with draft', () => {
      const result = ItemEntity.create({
        type: 'CreateItem',
        itemId: ITEM_ID,
        organizationId: ORG_ID,
        typeId: TYPE_ID,
        widgets: WIDGETS,
        widgetSettings: WIDGET_SETTINGS,
        allowedWidgetTypes: ALLOWED,
        now: NOW,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      const { state, event } = result.value;
      expect(event.type).toBe('item.created');
      expect(state.draft).not.toBeNull();
      expect(state.draft!.status).toBe('draft');
      expect(state.publication).toBeNull();
    });

    it('returns MissingRequiredWidgetsError when required widgets missing', () => {
      const result = ItemEntity.create({
        type: 'CreateItem',
        itemId: ITEM_ID,
        organizationId: ORG_ID,
        typeId: TYPE_ID,
        widgets: [BASE_WIDGET], // missing 'owner'
        widgetSettings: WIDGET_SETTINGS,
        allowedWidgetTypes: ALLOWED,
        now: NOW,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('missing_required_widgets');
      }
    });

    it('returns InvalidWidgetTypesError for unavailable widget types', () => {
      const scheduleWidget: ItemWidget = { type: 'schedule', entries: [] };
      const result = ItemEntity.create({
        type: 'CreateItem',
        itemId: ITEM_ID,
        organizationId: ORG_ID,
        typeId: TYPE_ID,
        widgets: [...WIDGETS, scheduleWidget],
        widgetSettings: WIDGET_SETTINGS, // doesn't include 'schedule'
        allowedWidgetTypes: [...ALLOWED, 'schedule'],
        now: NOW,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('invalid_widget_types');
      }
    });

    it('returns WidgetNotAllowedByPlanError for plan-restricted widgets', () => {
      const locationWidget: ItemWidget = {
        type: 'location',
        cityId: 'c1',
        lat: 0,
        lng: 0,
        address: null,
      };
      const result = ItemEntity.create({
        type: 'CreateItem',
        itemId: ITEM_ID,
        organizationId: ORG_ID,
        typeId: TYPE_ID,
        widgets: [...WIDGETS, locationWidget],
        widgetSettings: WIDGET_SETTINGS,
        allowedWidgetTypes: ['base-info', 'owner'], // 'location' not allowed
        now: NOW,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('widget_not_allowed_by_plan');
      }
    });

    it('returns InvalidPaymentStrategyError for disallowed strategy', () => {
      const paymentSettings: WidgetSettings[] = [
        { type: 'base-info', required: true },
        { type: 'owner', required: true },
        { type: 'payment', required: false, allowedStrategies: ['free'] },
      ];
      const paymentWidget: ItemWidget = { type: 'payment', options: [{ name: 'Подписка', description: null, strategy: 'subscription', price: 100 }] };
      const result = ItemEntity.create({
        type: 'CreateItem',
        itemId: ITEM_ID,
        organizationId: ORG_ID,
        typeId: TYPE_ID,
        widgets: [...WIDGETS, paymentWidget],
        widgetSettings: paymentSettings,
        allowedWidgetTypes: [...ALLOWED, 'payment'],
        now: NOW,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('invalid_payment_strategy');
      }
    });

    it('returns EventDateTimeLimitExceededError when maxDates exceeded', () => {
      const dateSettings: WidgetSettings[] = [
        { type: 'base-info', required: true },
        { type: 'owner', required: true },
        { type: 'event-date-time', required: false, maxDates: 1 },
      ];
      const dateWidget: ItemWidget = {
        type: 'event-date-time',
        dates: ['2024-07-01', '2024-07-02'],
      };
      const result = ItemEntity.create({
        type: 'CreateItem',
        itemId: ITEM_ID,
        organizationId: ORG_ID,
        typeId: TYPE_ID,
        widgets: [...WIDGETS, dateWidget],
        widgetSettings: dateSettings,
        allowedWidgetTypes: [...ALLOWED, 'event-date-time'],
        now: NOW,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('event_date_time_limit_exceeded');
      }
    });
  });

  describe('updateDraft', () => {
    it('updates draft widgets', () => {
      const state = createItem();
      const newWidgets: ItemWidget[] = [{ ...BASE_WIDGET, title: 'Updated' }, OWNER_WIDGET];

      const result = ItemEntity.updateDraft(state, {
        type: 'UpdateDraft',
        widgets: newWidgets,
        widgetSettings: WIDGET_SETTINGS,
        allowedWidgetTypes: ALLOWED,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;
      expect(result.value.state.draft!.widgets[0]!.type).toBe('base-info');
    });

    it('returns ItemNoDraftError if no draft', () => {
      const state = publishedItem();
      const result = ItemEntity.updateDraft(state, {
        type: 'UpdateDraft',
        widgets: WIDGETS,
        widgetSettings: WIDGET_SETTINGS,
        allowedWidgetTypes: ALLOWED,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('item_no_draft');
      }
    });

    it('returns ItemDraftInModerationError if draft in moderation', () => {
      const state = itemInModeration();
      const result = ItemEntity.updateDraft(state, {
        type: 'UpdateDraft',
        widgets: WIDGETS,
        widgetSettings: WIDGET_SETTINGS,
        allowedWidgetTypes: ALLOWED,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('item_draft_in_moderation');
      }
    });
  });

  describe('deleteDraft', () => {
    it('returns null state when no publication exists (full delete)', () => {
      const state = createItem();
      const result = ItemEntity.deleteDraft(state, { type: 'DeleteDraft', now: LATER });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;
      expect(result.value.state).toBeNull();
    });

    it('returns ItemNoDraftError if no draft', () => {
      const state = publishedItem();
      const result = ItemEntity.deleteDraft(state, { type: 'DeleteDraft', now: LATER });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('item_no_draft');
      }
    });
  });

  describe('submitForModeration', () => {
    it('submits draft for moderation', () => {
      const state = createItem();
      const result = ItemEntity.submitForModeration(state, {
        type: 'SubmitItemForModeration',
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;
      expect(result.value.state.draft!.status).toBe('moderation-request');
      expect(result.value.event.type).toBe('item.submitted-for-moderation');
    });

    it('submits from rejected status', () => {
      let state = itemInModeration();
      const rej = ItemEntity.rejectModeration(state, { type: 'RejectItemModeration', now: NOW });
      if (isLeft(rej)) throw new Error('Expected Right');
      state = rej.value.state;

      const result = ItemEntity.submitForModeration(state, {
        type: 'SubmitItemForModeration',
        now: LATER,
      });
      expect(isLeft(result)).toBe(false);
    });

    it('returns ItemDraftInModerationError if already in moderation', () => {
      const state = itemInModeration();
      const result = ItemEntity.submitForModeration(state, {
        type: 'SubmitItemForModeration',
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('item_draft_in_moderation');
      }
    });

    it('returns ItemNoDraftError if no draft', () => {
      const state = publishedItem();
      const result = ItemEntity.submitForModeration(state, {
        type: 'SubmitItemForModeration',
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('item_no_draft');
      }
    });
  });

  describe('approveModeration', () => {
    it('creates publication and clears draft', () => {
      const state = itemInModeration();
      const result = ItemEntity.approveModeration(state, {
        type: 'ApproveItemModeration',
        eventId: 'evt-1',
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;
      expect(result.value.state.draft).toBeNull();
      expect(result.value.state.publication).not.toBeNull();
      expect(result.value.event.republished).toBe(false);
    });

    it('returns ItemDraftNotInModerationError if draft not in moderation', () => {
      const state = createItem();
      const result = ItemEntity.approveModeration(state, {
        type: 'ApproveItemModeration',
        eventId: 'evt-1',
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('item_draft_not_in_moderation');
      }
    });

    it('returns ItemNoDraftError if no draft', () => {
      const state = publishedItem();
      const result = ItemEntity.approveModeration(state, {
        type: 'ApproveItemModeration',
        eventId: 'evt-1',
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('item_no_draft');
      }
    });
  });

  describe('rejectModeration', () => {
    it('sets draft status to rejected', () => {
      const state = itemInModeration();
      const result = ItemEntity.rejectModeration(state, {
        type: 'RejectItemModeration',
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;
      expect(result.value.state.draft!.status).toBe('rejected');
    });

    it('returns ItemDraftNotInModerationError if not in moderation', () => {
      const state = createItem();
      const result = ItemEntity.rejectModeration(state, {
        type: 'RejectItemModeration',
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('item_draft_not_in_moderation');
      }
    });
  });

  describe('unpublish', () => {
    it('removes publication and creates draft from publication data', () => {
      const state = publishedItem();
      const result = ItemEntity.unpublish(state, {
        type: 'UnpublishItem',
        eventId: 'evt-unpub',
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.publication).toBeNull();
      expect(result.value.state.draft).not.toBeNull();
      expect(result.value.state.draft!.status).toBe('draft');
      expect(result.value.state.draft!.widgets).toEqual(state.publication!.widgets);
      expect(result.value.event.type).toBe('item.unpublished-internal');
    });

    it('returns ItemNoPublicationError if not published', () => {
      const state = createItem();
      const result = ItemEntity.unpublish(state, {
        type: 'UnpublishItem',
        eventId: 'evt-1',
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('item_no_publication');
      }
    });
  });
});
