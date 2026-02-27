import { describe, expect, it } from 'vitest';

import { sessionApply } from './apply.js';
import type { SessionState } from './state.js';
import type { SessionId, UserId } from '@/kernel/domain/ids.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const SESSION_ID = 'session-1' as SessionId;
const NEW_SESSION_ID = 'session-2' as SessionId;
const USER_ID = 'user-1' as UserId;
const NOW = new Date('2024-06-01T12:00:00.000Z');
const EXPIRES = new Date('2024-06-02T12:00:00.000Z');

const makeSession = (): SessionState => ({
  id: SESSION_ID,
  userId: USER_ID,
  createdAt: NOW,
  expiresAt: EXPIRES,
});

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('sessionApply', () => {
  describe('session.created', () => {
    it('создаёт SessionState из null', () => {
      const result = sessionApply(null, {
        type: 'session.created',
        id: SESSION_ID,
        userId: USER_ID,
        createdAt: NOW,
        expiresAt: EXPIRES,
      });

      expect(result).toEqual({
        id: SESSION_ID,
        userId: USER_ID,
        createdAt: NOW,
        expiresAt: EXPIRES,
      });
    });
  });

  describe('session.rotated', () => {
    it('заменяет сессию на новую', () => {
      const state = makeSession();
      const later = new Date('2024-06-01T14:00:00.000Z');
      const newExpires = new Date('2024-06-02T14:00:00.000Z');

      const result = sessionApply(state, {
        type: 'session.rotated',
        newId: NEW_SESSION_ID,
        userId: USER_ID,
        createdAt: later,
        expiresAt: newExpires,
      });

      expect(result).toEqual({
        id: NEW_SESSION_ID,
        userId: USER_ID,
        createdAt: later,
        expiresAt: newExpires,
      });
    });
  });

  describe('session.deleted', () => {
    it('возвращает null', () => {
      const state = makeSession();
      const result = sessionApply(state, { type: 'session.deleted' });
      expect(result).toBeNull();
    });
  });
});
