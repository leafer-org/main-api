/** biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: test describe */
import { describe, expect, it } from 'vitest';

import { ManualPermissionsStore } from './permissions-store.js';
import { BooleanPerm, EnumPerm } from './schema.js';

describe('ManualPermissionsStore', () => {
  const testPerms = {
    login: BooleanPerm('AUTH.CAN_LOGIN'),
    logout: BooleanPerm('AUTH.CAN_LOGOUT', true),
    accessLevel: EnumPerm('ACCESS.LEVEL', ['all', 'self', 'none'], 'none'),
  };

  it('should implement PermissionsMapStore interface', () => {
    const store = new ManualPermissionsStore(() => ({}));

    expect(store.get).toBeInstanceOf(Function);
    expect(store.get()).toHaveProperty('roles');
  });

  it('should create permissions map from builder', () => {
    const store = new ManualPermissionsStore((can) => ({
      USER: [can(testPerms.login)],
    }));

    const map = store.get();

    expect(map).toHaveProperty('roles');
    expect(map.roles).toHaveProperty('USER');
  });

  it('should convert builder result to correct structure', () => {
    const store = new ManualPermissionsStore((can) => ({
      USER: [can(testPerms.login)],
    }));

    const map = store.get();

    expect(map.roles.USER).toEqual({
      'AUTH.CAN_LOGIN': true,
    });
  });

  it('should handle multiple permissions per role', () => {
    const store = new ManualPermissionsStore((can) => ({
      ADMIN: [can(testPerms.login), can(testPerms.logout), can(testPerms.accessLevel, 'all')],
    }));

    const map = store.get();

    expect(map.roles.ADMIN).toEqual({
      'AUTH.CAN_LOGIN': true,
      'AUTH.CAN_LOGOUT': true,
      'ACCESS.LEVEL': 'all',
    });
  });

  it('should handle multiple roles', () => {
    const store = new ManualPermissionsStore((can) => ({
      USER: [can(testPerms.login), can(testPerms.accessLevel, 'self')],
      ADMIN: [can(testPerms.login), can(testPerms.accessLevel, 'all')],
      GUEST: [can(testPerms.login, false), can(testPerms.accessLevel, 'none')],
    }));

    const map = store.get();

    expect(Object.keys(map.roles)).toEqual(['USER', 'ADMIN', 'GUEST']);
    expect(map.roles.USER?.['ACCESS.LEVEL']).toBe('self');
    expect(map.roles.ADMIN?.['ACCESS.LEVEL']).toBe('all');
    expect(map.roles.GUEST?.['ACCESS.LEVEL']).toBe('none');
  });

  it('should handle boolean permissions', () => {
    const store = new ManualPermissionsStore((can) => ({
      USER: [can(testPerms.login, false)],
      ADMIN: [can(testPerms.login)],
    }));

    const map = store.get();

    expect(map.roles.USER?.['AUTH.CAN_LOGIN']).toBe(false);
    expect(map.roles.ADMIN?.['AUTH.CAN_LOGIN']).toBe(true);
  });

  it('should handle enum permissions', () => {
    const store = new ManualPermissionsStore((can) => ({
      VIEWER: [can(testPerms.accessLevel, 'none')],
      EDITOR: [can(testPerms.accessLevel, 'self')],
      ADMIN: [can(testPerms.accessLevel, 'all')],
    }));

    const map = store.get();

    expect(map.roles.VIEWER?.['ACCESS.LEVEL']).toBe('none');
    expect(map.roles.EDITOR?.['ACCESS.LEVEL']).toBe('self');
    expect(map.roles.ADMIN?.['ACCESS.LEVEL']).toBe('all');
  });

  it('should handle empty roles', () => {
    const store = new ManualPermissionsStore(() => ({}));

    const map = store.get();

    expect(map.roles).toEqual({});
  });

  it('should handle role with empty permissions', () => {
    const store = new ManualPermissionsStore(() => ({
      EMPTY_ROLE: [],
    }));

    const map = store.get();

    expect(map.roles.EMPTY_ROLE).toEqual({});
  });

  it('should return same map on multiple get calls', () => {
    const store = new ManualPermissionsStore((can) => ({
      USER: [can(testPerms.login)],
    }));

    const map1 = store.get();
    const map2 = store.get();

    expect(map1).toBe(map2);
  });
});
