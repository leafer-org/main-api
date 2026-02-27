import { describe, expect, it } from 'vitest';

import { sessionDecide } from './decide.js';
import type { SessionState } from './state.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import type { SessionId, UserId } from '@/kernel/domain/ids.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const SESSION_ID = 'session-1' as SessionId;
const NEW_SESSION_ID = 'session-2' as SessionId;
const USER_ID = 'user-1' as UserId;
const NOW = new Date('2024-06-01T12:00:00.000Z');
const TTL_MS = 24 * 60 * 60 * 1000; // 1 день
const EXPIRES = new Date(NOW.getTime() + TTL_MS);

const makeSession = (): SessionState => ({
  id: SESSION_ID,
  userId: USER_ID,
  createdAt: NOW,
  expiresAt: EXPIRES,
});

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('sessionDecide', () => {
  describe('CreateSession', () => {
    it('возвращает session.created если state = null', () => {
      const result = sessionDecide(null, {
        type: 'CreateSession',
        id: SESSION_ID,
        userId: USER_ID,
        now: NOW,
        ttlMs: TTL_MS,
      });

      expect(result).toEqual(
        Right({
          type: 'session.created',
          id: SESSION_ID,
          userId: USER_ID,
          createdAt: NOW,
          expiresAt: EXPIRES,
        }),
      );
    });

    it('возвращает SessionAlreadyExistsError если сессия существует', () => {
      const state = makeSession();
      const result = sessionDecide(state, {
        type: 'CreateSession',
        id: 'session-new' as SessionId,
        userId: USER_ID,
        now: NOW,
        ttlMs: TTL_MS,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('session_already_exists');
      }
    });
  });

  describe('RotateSession', () => {
    it('возвращает session.rotated при существующей сессии', () => {
      const state = makeSession();
      const later = new Date('2024-06-01T14:00:00.000Z');

      const result = sessionDecide(state, {
        type: 'RotateSession',
        newId: NEW_SESSION_ID,
        userId: USER_ID,
        now: later,
        ttlMs: TTL_MS,
      });

      expect(result).toEqual(
        Right({
          type: 'session.rotated',
          newId: NEW_SESSION_ID,
          userId: USER_ID,
          createdAt: later,
          expiresAt: new Date(later.getTime() + TTL_MS),
        }),
      );
    });

    it('возвращает SessionNotFoundError если state = null', () => {
      const result = sessionDecide(null, {
        type: 'RotateSession',
        newId: NEW_SESSION_ID,
        userId: USER_ID,
        now: NOW,
        ttlMs: TTL_MS,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('session_not_found');
      }
    });
  });

  describe('DeleteSession', () => {
    it('возвращает session.deleted при существующей сессии', () => {
      const state = makeSession();
      const result = sessionDecide(state, { type: 'DeleteSession' });
      expect(result).toEqual(Right({ type: 'session.deleted' }));
    });

    it('возвращает SessionNotFoundError если state = null', () => {
      const result = sessionDecide(null, { type: 'DeleteSession' });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('session_not_found');
      }
    });
  });
});
