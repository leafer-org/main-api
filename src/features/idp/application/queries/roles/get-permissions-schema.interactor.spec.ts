import { describe, expect, it } from 'vitest';

import {
  buildPermissionsSchema,
  GetPermissionsSchemaInteractor,
} from './get-permissions-schema.interactor.js';
import { isLeft, isRight } from '@/infra/lib/box.js';
import { MockPermissionCheckService } from '@/infra/test/mock.js';
import { PermissionDeniedError } from '@/kernel/application/ports/permission.js';

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('GetPermissionsSchemaInteractor', () => {
  it('возвращает схему разрешений', () => {
    const permissionCheck = new MockPermissionCheckService();
    const interactor = new GetPermissionsSchemaInteractor(permissionCheck);
    const result = interactor.execute();

    expect(isRight(result)).toBe(true);
    if (isRight(result)) {
      expect(result.value).toEqual(buildPermissionsSchema());
    }
  });

  it('каждый элемент схемы содержит action, key, type и default', () => {
    const schema = buildPermissionsSchema();

    for (const item of schema) {
      expect(item).toHaveProperty('action');
      expect(item).toHaveProperty('key');
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('default');
      expect(['boolean', 'enum']).toContain(item.type);
    }
  });

  it('enum-разрешения содержат values', () => {
    const schema = buildPermissionsSchema();
    const enumItems = schema.filter((item) => item.type === 'enum');

    for (const item of enumItems) {
      expect(item.values).toBeDefined();
      expect(Array.isArray(item.values)).toBe(true);
    }
  });

  it('возвращает PermissionDeniedError если нет прав', () => {
    const permissionCheck = new MockPermissionCheckService().deny('ROLE.MANAGE', 'USER');
    const interactor = new GetPermissionsSchemaInteractor(permissionCheck);
    const result = interactor.execute();

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error).toBeInstanceOf(PermissionDeniedError);
    }
  });
});
