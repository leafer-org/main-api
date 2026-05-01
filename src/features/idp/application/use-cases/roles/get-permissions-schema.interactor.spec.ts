import { describe, expect, it } from 'vitest';

import {
  buildPermissionsCatalog,
  GetPermissionsSchemaInteractor,
} from './get-permissions-schema.interactor.js';
import { isLeft, isRight } from '@/infra/lib/box.js';
import { MockPermissionCheckService } from '@/infra/test/mock.js';
import { PermissionDeniedError } from '@/kernel/application/ports/permission.js';

describe('GetPermissionsSchemaInteractor', () => {
  it('returns catalog of permission groups', async () => {
    const permissionCheck = new MockPermissionCheckService();
    const interactor = new GetPermissionsSchemaInteractor(permissionCheck);
    const result = await interactor.execute();

    expect(isRight(result)).toBe(true);
    if (isRight(result)) {
      expect(result.value).toEqual({ groups: buildPermissionsCatalog() });
    }
  });

  it('every group has an id, title and permissions', () => {
    const groups = buildPermissionsCatalog();
    expect(groups.length).toBeGreaterThan(0);

    for (const group of groups) {
      expect(group).toHaveProperty('id');
      expect(group).toHaveProperty('title');
      expect(Array.isArray(group.permissions)).toBe(true);
      expect(group.permissions.length).toBeGreaterThan(0);

      for (const perm of group.permissions) {
        expect(perm).toHaveProperty('id');
        expect(perm).toHaveProperty('title');
        expect(perm).toHaveProperty('description');
      }
    }
  });

  it('returns PermissionDeniedError when role.read is missing', async () => {
    const permissionCheck = new MockPermissionCheckService().deny('role.read', 'USER');
    const interactor = new GetPermissionsSchemaInteractor(permissionCheck);
    const result = await interactor.execute();

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
    }
  });
});
