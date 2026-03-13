import { describe, expect, it } from 'vitest';

import { SessionEntity } from './entity.js';
import type { SessionState } from './state.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { SessionId, UserId } from '@/kernel/domain/ids.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const SESSION_ID = SessionId.raw('session-1');
const NEW_SESSION_ID = SessionId.raw('session-2');
const USER_ID = UserId.raw('user-1');
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

describe('SessionEntity', () => {
  describe('create', () => {
    it('возвращает state и event если state = null', () => {
      const result = SessionEntity.create(null, {
        type: 'CreateSession',
        id: SESSION_ID,
        userId: USER_ID,
        now: NOW,
        ttlMs: TTL_MS,
      });

      expect(result).toEqual(
        Right({
          state: {
            id: SESSION_ID,
            userId: USER_ID,
            createdAt: NOW,
            expiresAt: EXPIRES,
          },
          event: {
            type: 'session.created',
            id: SESSION_ID,
            userId: USER_ID,
            createdAt: NOW,
            expiresAt: EXPIRES,
          },
        }),
      );
    });

    it('возвращает SessionAlreadyExistsError если сессия существует', () => {
      const state = makeSession();
      const result = SessionEntity.create(state, {
        type: 'CreateSession',
        id: SessionId.raw('session-new'),
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

  describe('rotate', () => {
    it('возвращает новый state и event при существующей сессии', () => {
      const state = makeSession();
      const later = new Date('2024-06-01T14:00:00.000Z');

      const result = SessionEntity.rotate(state, {
        type: 'RotateSession',
        newId: NEW_SESSION_ID,
        userId: USER_ID,
        now: later,
        ttlMs: TTL_MS,
      });

      expect(result).toEqual(
        Right({
          state: {
            id: NEW_SESSION_ID,
            userId: USER_ID,
            createdAt: later,
            expiresAt: new Date(later.getTime() + TTL_MS),
          },
          event: {
            type: 'session.rotated',
            newId: NEW_SESSION_ID,
            userId: USER_ID,
            createdAt: later,
            expiresAt: new Date(later.getTime() + TTL_MS),
          },
        }),
      );
    });

    it('возвращает SessionNotFoundError если state = null', () => {
      const result = SessionEntity.rotate(null, {
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

  describe('delete', () => {
    it('возвращает null state и event при существующей сессии', () => {
      const state = makeSession();
      const result = SessionEntity.delete(state, { type: 'DeleteSession' });

      expect(result).toEqual(
        Right({ state: null, event: { type: 'session.deleted' } }),
      );
    });

    it('возвращает SessionNotFoundError если state = null', () => {
      const result = SessionEntity.delete(null, { type: 'DeleteSession' });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('session_not_found');
      }
    });
  });
});
