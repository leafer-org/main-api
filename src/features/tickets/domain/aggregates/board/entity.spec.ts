import { describe, expect, it } from 'vitest';

import { BoardEntity } from './entity.js';
import { isLeft } from '@/infra/lib/box.js';
import { BoardAutomationId, BoardId, BoardSubscriptionId, UserId } from '@/kernel/domain/ids.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const BOARD_ID = BoardId.raw('board-1');
const BOARD_2_ID = BoardId.raw('board-2');
const USER_1 = UserId.raw('user-1');
const USER_2 = UserId.raw('user-2');
const SUB_1 = BoardSubscriptionId.raw('sub-1');
const SUB_2 = BoardSubscriptionId.raw('sub-2');
const AUTO_1 = BoardAutomationId.raw('auto-1');
const AUTO_2 = BoardAutomationId.raw('auto-2');
const NOW = new Date('2024-06-01T12:00:00.000Z');
const LATER = new Date('2024-06-02T12:00:00.000Z');

function createBoard() {
  const result = BoardEntity.create({
    type: 'CreateBoard',
    boardId: BOARD_ID,
    name: 'Модерация товаров',
    description: 'Доска для модерации',
    scope: 'platform',
    organizationId: null,
    manualCreation: false,
    now: NOW,
  });
  if (isLeft(result)) throw new Error('Expected Right');
  return result.value.state;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('BoardEntity', () => {
  describe('create', () => {
    it('creates board with empty subscriptions, members, and automations', () => {
      const result = BoardEntity.create({
        type: 'CreateBoard',
        boardId: BOARD_ID,
        name: 'Test Board',
        description: null,
        scope: 'platform',
        organizationId: null,
        manualCreation: true,
        now: NOW,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      const { state, event } = result.value;

      expect(event.type).toBe('board.created');
      expect(event.boardId).toBe(BOARD_ID);

      expect(state.name).toBe('Test Board');
      expect(state.scope).toBe('platform');
      expect(state.manualCreation).toBe(true);
      expect(state.subscriptions).toHaveLength(0);
      expect(state.memberIds).toHaveLength(0);
      expect(state.allowedTransferBoardIds).toHaveLength(0);
      expect(state.automations).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('updates name, description, manualCreation, and allowedTransferBoardIds', () => {
      const state = createBoard();
      const result = BoardEntity.update(state, {
        type: 'UpdateBoard',
        name: 'Updated Board',
        description: 'New description',
        manualCreation: true,
        allowedTransferBoardIds: [BOARD_2_ID],
        closeTrigger: null,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.name).toBe('Updated Board');
      expect(result.value.state.description).toBe('New description');
      expect(result.value.state.manualCreation).toBe(true);
      expect(result.value.state.allowedTransferBoardIds).toEqual([BOARD_2_ID]);
      expect(result.value.event.type).toBe('board.updated');
    });
  });

  describe('addSubscription', () => {
    it('adds subscription to the board', () => {
      const state = createBoard();

      const result = BoardEntity.addSubscription(state, {
        type: 'AddSubscription',
        subscriptionId: SUB_1,
        triggerId: 'item.moderation-requested',
        filters: [],
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.subscriptions).toHaveLength(1);
      expect(result.value.state.subscriptions[0]!.id).toBe(SUB_1);
      expect(result.value.state.subscriptions[0]!.triggerId).toBe('item.moderation-requested');
      expect(result.value.event.type).toBe('board.subscription-added');
    });
  });

  describe('removeSubscription', () => {
    it('removes subscription by id', () => {
      let state = createBoard();

      let r = BoardEntity.addSubscription(state, {
        type: 'AddSubscription',
        subscriptionId: SUB_1,
        triggerId: 'item.moderation-requested',
        filters: [],
        now: NOW,
      });
      if (isLeft(r)) throw new Error('Expected Right');
      state = r.value.state;

      r = BoardEntity.addSubscription(state, {
        type: 'AddSubscription',
        subscriptionId: SUB_2,
        triggerId: 'organization.moderation-requested',
        filters: [],
        now: NOW,
      });
      if (isLeft(r)) throw new Error('Expected Right');
      state = r.value.state;

      expect(state.subscriptions).toHaveLength(2);

      const result = BoardEntity.removeSubscription(state, {
        type: 'RemoveSubscription',
        subscriptionId: SUB_1,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.subscriptions).toHaveLength(1);
      expect(result.value.state.subscriptions[0]!.triggerId).toBe(
        'organization.moderation-requested',
      );
    });

    it('returns SubscriptionNotFoundError for unknown id', () => {
      const state = createBoard();
      const result = BoardEntity.removeSubscription(state, {
        type: 'RemoveSubscription',
        subscriptionId: SUB_1,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('subscription_not_found');
      }
    });
  });

  describe('addMember', () => {
    it('adds member to the board', () => {
      const state = createBoard();
      const result = BoardEntity.addMember(state, {
        type: 'AddMember',
        userId: USER_1,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.memberIds).toHaveLength(1);
      expect(result.value.state.memberIds[0]).toBe(USER_1);
      expect(result.value.event.type).toBe('board.member-added');
    });

    it('returns MemberAlreadyExistsError for duplicate', () => {
      let state = createBoard();
      const r = BoardEntity.addMember(state, {
        type: 'AddMember',
        userId: USER_1,
        now: NOW,
      });
      if (isLeft(r)) throw new Error('Expected Right');
      state = r.value.state;

      const result = BoardEntity.addMember(state, {
        type: 'AddMember',
        userId: USER_1,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('member_already_exists');
      }
    });
  });

  describe('removeMember', () => {
    it('removes member from the board', () => {
      let state = createBoard();
      const r = BoardEntity.addMember(state, {
        type: 'AddMember',
        userId: USER_1,
        now: NOW,
      });
      if (isLeft(r)) throw new Error('Expected Right');
      state = r.value.state;

      const result = BoardEntity.removeMember(state, {
        type: 'RemoveMember',
        userId: USER_1,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.memberIds).toHaveLength(0);
      expect(result.value.event.type).toBe('board.member-removed');
    });

    it('returns MemberNotFoundError for unknown user', () => {
      const state = createBoard();
      const result = BoardEntity.removeMember(state, {
        type: 'RemoveMember',
        userId: USER_2,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('member_not_found');
      }
    });
  });

  describe('addAutomation', () => {
    it('adds automation to the board', () => {
      const state = createBoard();

      const result = BoardEntity.addAutomation(state, {
        type: 'AddAutomation',
        automationId: AUTO_1,
        agentId: 'agent-1',
        systemPrompt: 'Moderate this item',
        onUncertainMoveToBoardId: BOARD_2_ID,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.automations).toHaveLength(1);
      expect(result.value.state.automations[0]!.id).toBe(AUTO_1);
      expect(result.value.state.automations[0]!.agentId).toBe('agent-1');
      expect(result.value.state.automations[0]!.enabled).toBe(true);
      expect(result.value.event.type).toBe('board.automation-added');
    });

    it('adds multiple automations', () => {
      let state = createBoard();

      const r = BoardEntity.addAutomation(state, {
        type: 'AddAutomation',
        automationId: AUTO_1,
        agentId: 'agent-1',
        systemPrompt: 'Prompt 1',
        onUncertainMoveToBoardId: null,
        now: NOW,
      });
      if (isLeft(r)) throw new Error('Expected Right');
      state = r.value.state;

      const result = BoardEntity.addAutomation(state, {
        type: 'AddAutomation',
        automationId: AUTO_2,
        agentId: 'agent-2',
        systemPrompt: 'Prompt 2',
        onUncertainMoveToBoardId: BOARD_2_ID,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.automations).toHaveLength(2);
      expect(result.value.state.automations[0]!.agentId).toBe('agent-1');
      expect(result.value.state.automations[1]!.agentId).toBe('agent-2');
    });
  });

  describe('removeAutomation', () => {
    it('removes automation by id', () => {
      let state = createBoard();

      let r = BoardEntity.addAutomation(state, {
        type: 'AddAutomation',
        automationId: AUTO_1,
        agentId: 'agent-1',
        systemPrompt: 'Prompt 1',
        onUncertainMoveToBoardId: null,
        now: NOW,
      });
      if (isLeft(r)) throw new Error('Expected Right');
      state = r.value.state;

      r = BoardEntity.addAutomation(state, {
        type: 'AddAutomation',
        automationId: AUTO_2,
        agentId: 'agent-2',
        systemPrompt: 'Prompt 2',
        onUncertainMoveToBoardId: null,
        now: NOW,
      });
      if (isLeft(r)) throw new Error('Expected Right');
      state = r.value.state;

      const result = BoardEntity.removeAutomation(state, {
        type: 'RemoveAutomation',
        automationId: AUTO_1,
        now: LATER,
      });

      expect(isLeft(result)).toBe(false);
      if (isLeft(result)) return;

      expect(result.value.state.automations).toHaveLength(1);
      expect(result.value.state.automations[0]!.agentId).toBe('agent-2');
      expect(result.value.event.type).toBe('board.automation-removed');
    });

    it('returns AutomationNotFoundError for unknown id', () => {
      const state = createBoard();
      const result = BoardEntity.removeAutomation(state, {
        type: 'RemoveAutomation',
        automationId: AUTO_1,
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('automation_not_found');
      }
    });
  });
});
