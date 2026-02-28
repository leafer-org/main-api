import { describe, expect, it } from 'vitest';

import type { RolesListReadModel } from '../../../domain/read-models/roles-list.read-model.js';
import type { RolesListQueryPort } from '../../ports.js';
import { GetRolesListInteractor } from './get-roles-list.interactor.js';
import { Right } from '@/infra/lib/box.js';
import { ServiceMock } from '@/infra/test/mock.js';
import { RoleId } from '@/kernel/domain/ids.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const NOW = new Date('2024-06-01T12:00:00.000Z');

const READ_MODEL: RolesListReadModel = {
  roles: [
    {
      id: RoleId.raw('role-1'),
      name: 'Admin',
      permissions: { 'ROLE.MANAGE': true },
      isStatic: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: RoleId.raw('role-2'),
      name: 'Editor',
      permissions: {},
      isStatic: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
};

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('GetRolesListInteractor', () => {
  it('возвращает список ролей', async () => {
    const rolesListQuery = ServiceMock<RolesListQueryPort>();
    rolesListQuery.findAll.mockResolvedValue(READ_MODEL);

    const interactor = new GetRolesListInteractor(rolesListQuery);
    const result = await interactor.execute();

    expect(result).toEqual(Right(READ_MODEL));
    expect(rolesListQuery.findAll).toHaveBeenCalled();
  });
});
