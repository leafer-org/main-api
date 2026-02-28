import { describe, expect, it } from 'vitest';

import {
  buildPermissionsSchema,
  GetPermissionsSchemaInteractor,
} from './get-permissions-schema.interactor.js';
import { isRight } from '@/infra/lib/box.js';

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('GetPermissionsSchemaInteractor', () => {
  it('возвращает схему разрешений', () => {
    const interactor = new GetPermissionsSchemaInteractor();
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
});
