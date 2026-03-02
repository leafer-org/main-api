/** biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: test describe to long */
import { describe, expect, it, vi } from 'vitest';

import { StaticSessionContext } from '../session/session-context.js';
import { PermissionService } from './permission-service.js';
import type { PermissionsMap } from './permissions-store.js';
import { PermissionsStore } from './permissions-store.js';
import { BooleanPerm, EnumPerm } from './schema.js';

class TestPermissionsStore extends PermissionsStore {
  public constructor(private readonly map: PermissionsMap) {
    super();
  }

  public get(): PermissionsMap {
    return this.map;
  }

  public async refresh(): Promise<void> {}
}

function createStore(roles: PermissionsMap['roles']): TestPermissionsStore {
  return new TestPermissionsStore({ roles });
}

describe('PermissionService', () => {
  const testPerms = {
    canLogin: BooleanPerm('AUTH.CAN_LOGIN', false),
    canLogout: BooleanPerm('AUTH.CAN_LOGOUT', true),
    accessLevel: EnumPerm('ACCESS.LEVEL', ['all', 'self', 'none'] as const, 'none'),
  };

  describe('canLocal', () => {
    it('should return true for boolean permission set to true', () => {
      const store = createStore({
        ADMIN: { 'AUTH.CAN_LOGIN': true },
      });
      const sessionContext = new StaticSessionContext('ADMIN');
      const service = new PermissionService(store, sessionContext);

      const result = service.canLocal(testPerms.canLogin, 'ADMIN');

      expect(result).toBe(true);
    });

    it('should return false for boolean permission set to false', () => {
      const store = createStore({
        USER: { 'AUTH.CAN_LOGIN': false, 'ACCESS.LEVEL': 'all' },
      });
      const sessionContext = new StaticSessionContext('USER');
      const service = new PermissionService(store, sessionContext);

      const result = service.canLocal(testPerms.canLogin, 'USER');

      expect(result).toBe(false);
    });

    it('should return false for non-existent role', () => {
      const store = createStore({});
      const sessionContext = new StaticSessionContext('UNKNOWN');
      const service = new PermissionService(store, sessionContext);

      const result = service.canLocal(testPerms.canLogin, 'UNKNOWN');

      expect(result).toBe(false);
    });

    it('should use default value when permission is not set', () => {
      const store = createStore({ USER: {} });
      const sessionContext = new StaticSessionContext('USER');
      const service = new PermissionService(store, sessionContext);

      const resultLogin = service.canLocal(testPerms.canLogin, 'USER');
      const resultLogout = service.canLocal(testPerms.canLogout, 'USER');

      expect(resultLogin).toBe(false);
      expect(resultLogout).toBe(true);
    });

    it('should call where function for enum permission and return true', () => {
      const store = createStore({
        ADMIN: { 'ACCESS.LEVEL': 'all' },
      });
      const sessionContext = new StaticSessionContext('ADMIN');
      const service = new PermissionService(store, sessionContext);
      const where = vi.fn((value: string) => value === 'all');

      const result = service.canLocal(testPerms.accessLevel, 'ADMIN', where);

      expect(where).toHaveBeenCalledWith('all');
      expect(result).toBe(true);
    });

    it('should call where function for enum permission and return false', () => {
      const store = createStore({
        USER: { 'ACCESS.LEVEL': 'self' },
      });
      const sessionContext = new StaticSessionContext('USER');
      const service = new PermissionService(store, sessionContext);
      const where = vi.fn((value: string) => value === 'all');

      const result = service.canLocal(testPerms.accessLevel, 'USER', where);

      expect(where).toHaveBeenCalledWith('self');
      expect(result).toBe(false);
    });

    it('should use default value for enum when not set', () => {
      const store = createStore({ USER: {} });
      const sessionContext = new StaticSessionContext('USER');
      const service = new PermissionService(store, sessionContext);
      const where = vi.fn((value: string) => value === 'none');

      const result = service.canLocal(testPerms.accessLevel, 'USER', where);

      expect(where).toHaveBeenCalledWith('none');
      expect(result).toBe(true);
    });
  });

  describe('can', () => {
    it('should use role from SessionContext', () => {
      const store = createStore({
        ADMIN: { 'AUTH.CAN_LOGIN': true },
        USER: { 'AUTH.CAN_LOGIN': false },
      });
      const sessionContext = new StaticSessionContext('ADMIN');
      const service = new PermissionService(store, sessionContext);

      const result = service.can(testPerms.canLogin);

      expect(result).toBe(true);
    });

    it('should delegate to canLocal with current role', () => {
      const store = createStore({
        USER: { 'ACCESS.LEVEL': 'self' },
      });
      const sessionContext = new StaticSessionContext('USER');
      const service = new PermissionService(store, sessionContext);
      const where = vi.fn((value: string) => value === 'self');

      const result = service.can(testPerms.accessLevel, where);

      expect(where).toHaveBeenCalledWith('self');
      expect(result).toBe(true);
    });

    it('should return false when current role has no permissions', () => {
      const store = createStore({});
      const sessionContext = new StaticSessionContext('GUEST');
      const service = new PermissionService(store, sessionContext);

      const result = service.can(testPerms.canLogin);

      expect(result).toBe(false);
    });
  });
});
