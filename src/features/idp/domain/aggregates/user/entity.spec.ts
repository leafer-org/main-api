import { describe, expect, it } from 'vitest';

import { FullName } from '../../vo/full-name.js';
import { PhoneNumber } from '../../vo/phone-number.js';
import { UserEntity } from './entity.js';
import type { UserState } from './state.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo/role.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const USER_ID = UserId.raw('user-1');
const PHONE = PhoneNumber.raw('79991234567');
const FULL_NAME = FullName.raw('Иван Петров');
const ROLE = Role.default();
const NOW = new Date('2024-06-01T12:00:00.000Z');

const makeUser = (): UserState => ({
  id: USER_ID,
  phoneNumber: PHONE,
  fullName: FULL_NAME,
  avatarId: undefined,
  role: ROLE,
  cityId: 'city-1',
  createdAt: NOW,
  updatedAt: NOW,
});

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('UserEntity', () => {
  describe('create', () => {
    it('возвращает state и event если state = null', () => {
      const result = UserEntity.create(null, {
        type: 'CreateUser',
        id: USER_ID,
        phoneNumber: PHONE,
        fullName: FULL_NAME,
        avatarId: undefined,
        role: ROLE,
        cityId: 'city-1',
        now: NOW,
      });

      expect(result).toEqual(
        Right({
          state: {
            id: USER_ID,
            phoneNumber: PHONE,
            fullName: FULL_NAME,
            avatarId: undefined,
            role: ROLE,
            cityId: 'city-1',
            createdAt: NOW,
            updatedAt: NOW,
          },
          event: {
            type: 'user.created',
            id: USER_ID,
            phoneNumber: PHONE,
            fullName: FULL_NAME,
            avatarId: undefined,
            role: ROLE,
            cityId: 'city-1',
            createdAt: NOW,
          },
        }),
      );
    });

    it('возвращает UserAlreadyExistsError если user уже существует', () => {
      const state = makeUser();
      const result = UserEntity.create(state, {
        type: 'CreateUser',
        id: USER_ID,
        phoneNumber: PHONE,
        fullName: FULL_NAME,
        avatarId: undefined,
        role: ROLE,
        cityId: 'city-1',
        now: NOW,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('user_already_exists');
      }
    });
  });

  describe('updateProfile', () => {
    it('обновляет fullName и updatedAt', () => {
      const state = makeUser();
      const newName = FullName.raw('Пётр Сидоров');
      const later = new Date('2024-06-02T12:00:00.000Z');

      const result = UserEntity.updateProfile(state, {
        type: 'UpdateProfile',
        fullName: newName,
        avatarId: undefined,
        now: later,
      });

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.state).toEqual({
          ...state,
          fullName: newName,
          updatedAt: later,
        });
        expect(result.value.event).toEqual({
          type: 'user.profile_updated',
          fullName: newName,
          avatarId: undefined,
          updatedAt: later,
        });
      }
    });

    it('возвращает UserNotFoundError если state = null', () => {
      const result = UserEntity.updateProfile(null, {
        type: 'UpdateProfile',
        fullName: FULL_NAME,
        avatarId: undefined,
        now: NOW,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('user_not_found');
      }
    });
  });

  describe('updateRole', () => {
    it('обновляет роль и updatedAt', () => {
      const state = makeUser();
      const newRole = Role.raw('admin');
      const later = new Date('2024-06-02T12:00:00.000Z');

      const result = UserEntity.updateRole(state, {
        type: 'UpdateUserRole',
        role: newRole,
        now: later,
      });

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.state).toEqual({
          ...state,
          role: newRole,
          updatedAt: later,
        });
        expect(result.value.event).toEqual({
          type: 'user.role_updated',
          userId: USER_ID,
          role: newRole,
          updatedAt: later,
        });
      }
    });

    it('возвращает UserNotFoundError если state = null', () => {
      const result = UserEntity.updateRole(null, {
        type: 'UpdateUserRole',
        role: Role.raw('admin'),
        now: NOW,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('user_not_found');
      }
    });
  });
});
