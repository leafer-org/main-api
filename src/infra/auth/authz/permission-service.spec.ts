import { describe, expect, it } from 'vitest';

import { StaticSessionContext } from '../session/session-context.js';
import { PermissionService } from './permission-service.js';
import type { PermissionsMap } from './permissions-store.js';
import { PermissionsStore } from './permissions-store.js';
import { Permission } from '@/kernel/domain/permissions.js';

class TestPermissionsStore extends PermissionsStore {
  public constructor(private readonly map: PermissionsMap) {
    super();
  }

  public async get(): Promise<PermissionsMap> {
    return this.map;
  }
}

function createStore(roles: PermissionsMap['roles']): TestPermissionsStore {
  return new TestPermissionsStore({ roles });
}

describe('PermissionService', () => {
  describe('canLocal', () => {
    it('returns true when role contains the permission', async () => {
      const store = createStore({ ADMIN: [Permission.RoleCreate] });
      const service = new PermissionService(store, new StaticSessionContext('ADMIN'));

      const result = await service.canLocal(Permission.RoleCreate, 'ADMIN');

      expect(result).toBe(true);
    });

    it('returns false when role lacks the permission', async () => {
      const store = createStore({ USER: [Permission.UserRead] });
      const service = new PermissionService(store, new StaticSessionContext('USER'));

      const result = await service.canLocal(Permission.RoleCreate, 'USER');

      expect(result).toBe(false);
    });

    it('returns false for unknown role', async () => {
      const store = createStore({});
      const service = new PermissionService(store, new StaticSessionContext('GHOST'));

      const result = await service.canLocal(Permission.RoleCreate, 'GHOST');

      expect(result).toBe(false);
    });
  });

  describe('can', () => {
    it('uses role from SessionContext', async () => {
      const store = createStore({
        ADMIN: [Permission.UserBlock],
        USER: [],
      });
      const service = new PermissionService(store, new StaticSessionContext('ADMIN'));

      expect(await service.can(Permission.UserBlock)).toBe(true);
    });

    it('returns false when role has empty permissions', async () => {
      const store = createStore({ USER: [] });
      const service = new PermissionService(store, new StaticSessionContext('USER'));

      expect(await service.can(Permission.UserBlock)).toBe(false);
    });
  });
});
