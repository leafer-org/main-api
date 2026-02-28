import { describe, expect, it } from 'vitest';

import { RoleNotFoundError } from '../../../domain/aggregates/role/errors.js';
import type { RoleReadModel } from '../../../domain/read-models/role.read-model.js';
import type { RoleQueryPort } from '../../ports.js';
import { GetRoleInteractor } from './get-role.interactor.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { ServiceMock } from '@/infra/test/mock.js';
import { RoleId } from '@/kernel/domain/ids.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const ROLE_ID = RoleId.raw('role-1');
const NOW = new Date('2024-06-01T12:00:00.000Z');

const ROLE_READ_MODEL: RoleReadModel = {
  id: ROLE_ID,
  name: 'Editor',
  permissions: { 'ROLE.MANAGE': true },
  isStatic: false,
  createdAt: NOW,
  updatedAt: NOW,
};

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('GetRoleInteractor', () => {
  it('возвращает роль по ID', async () => {
    const roleQuery = ServiceMock<RoleQueryPort>();
    roleQuery.findRole.mockResolvedValue(ROLE_READ_MODEL);

    const interactor = new GetRoleInteractor(roleQuery);
    const result = await interactor.execute({ roleId: ROLE_ID });

    expect(result).toEqual(Right(ROLE_READ_MODEL));
    expect(roleQuery.findRole).toHaveBeenCalledWith(ROLE_ID);
  });

  it('возвращает RoleNotFoundError если роль не найдена', async () => {
    const roleQuery = ServiceMock<RoleQueryPort>();
    roleQuery.findRole.mockResolvedValue(null);

    const interactor = new GetRoleInteractor(roleQuery);
    const result = await interactor.execute({ roleId: ROLE_ID });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(RoleNotFoundError);
    }
  });
});
