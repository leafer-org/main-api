import { describe, expect, it } from 'vitest';

import { FullName } from '../../vo/full-name.js';
import { PhoneNumber } from '../../vo/phone-number.js';
import { userDecide } from './decide.js';
import type { UserState } from './state.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import type { UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const USER_ID = 'user-1' as UserId;
const PHONE = PhoneNumber.raw('79991234567');
const FULL_NAME = FullName.raw('Иван Петров');
const ROLE = Role.default();
const NOW = new Date('2024-06-01T12:00:00.000Z');

const makeUser = (): UserState => ({
  id: USER_ID,
  phoneNumber: PHONE,
  fullName: FULL_NAME,
  role: ROLE,
  createdAt: NOW,
  updatedAt: NOW,
});

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('userDecide', () => {
  describe('CreateUser', () => {
    it('возвращает user.created если state = null', () => {
      const result = userDecide(null, {
        type: 'CreateUser',
        id: USER_ID,
        phoneNumber: PHONE,
        fullName: FULL_NAME,
        role: ROLE,
        now: NOW,
      });

      expect(result).toEqual(
        Right({
          type: 'user.created',
          id: USER_ID,
          phoneNumber: PHONE,
          fullName: FULL_NAME,
          role: ROLE,
          createdAt: NOW,
        }),
      );
    });

    it('возвращает UserAlreadyExistsError если user уже существует', () => {
      const state = makeUser();
      const result = userDecide(state, {
        type: 'CreateUser',
        id: USER_ID,
        phoneNumber: PHONE,
        fullName: FULL_NAME,
        role: ROLE,
        now: NOW,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('user_already_exists');
      }
    });
  });

  describe('UpdateProfile', () => {
    it('возвращает user.profile_updated при существующем state', () => {
      const state = makeUser();
      const newName = FullName.raw('Пётр Сидоров');
      const later = new Date('2024-06-02T12:00:00.000Z');

      const result = userDecide(state, {
        type: 'UpdateProfile',
        fullName: newName,
        now: later,
      });

      expect(result).toEqual(
        Right({
          type: 'user.profile_updated',
          fullName: newName,
          updatedAt: later,
        }),
      );
    });

    it('возвращает UserNotFoundError если state = null', () => {
      const result = userDecide(null, {
        type: 'UpdateProfile',
        fullName: FULL_NAME,
        now: NOW,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('user_not_found');
      }
    });
  });
});
