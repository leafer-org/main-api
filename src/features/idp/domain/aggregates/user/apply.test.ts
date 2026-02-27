import { describe, expect, it } from 'vitest';

import { FullName } from '../../vo/full-name.js';
import { PhoneNumber } from '../../vo/phone-number.js';
import { userApply } from './apply.js';
import type { UserState } from './state.js';
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

describe('userApply', () => {
  describe('user.created', () => {
    it('создаёт UserState из null', () => {
      const result = userApply(null, {
        type: 'user.created',
        id: USER_ID,
        phoneNumber: PHONE,
        fullName: FULL_NAME,
        role: ROLE,
        createdAt: NOW,
      });

      expect(result).toEqual({
        id: USER_ID,
        phoneNumber: PHONE,
        fullName: FULL_NAME,
        role: ROLE,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
  });

  describe('user.profile_updated', () => {
    it('обновляет fullName и updatedAt', () => {
      const state = makeUser();
      const newName = FullName.raw('Пётр Сидоров');
      const later = new Date('2024-06-02T12:00:00.000Z');

      const result = userApply(state, {
        type: 'user.profile_updated',
        fullName: newName,
        updatedAt: later,
      });

      expect(result).toEqual({
        ...state,
        fullName: newName,
        updatedAt: later,
      });
    });

    it('выбрасывает ошибку если state = null', () => {
      expect(() =>
        userApply(null, {
          type: 'user.profile_updated',
          fullName: FULL_NAME,
          updatedAt: NOW,
        }),
      ).toThrow('State is required');
    });
  });
});
