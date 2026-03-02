import { Injectable } from '@nestjs/common';

import { PermissionsStore } from './permissions-store.js';
import type { InferPermissionValue, PermissionVariant } from './schema.js';
import { SessionContext } from './session-context.js';

export type WhereArg<T> = [T] extends [boolean] ? [] : [where: (value: T) => boolean];

@Injectable()
export class PermissionService {
  public constructor(
    private readonly store: PermissionsStore,
    private readonly sessionContext: SessionContext,
  ) {}

  public can<T extends PermissionVariant>(
    perm: T,
    ...args: WhereArg<InferPermissionValue<T>>
  ): boolean {
    const role = this.sessionContext.getRole();
    return this.canLocal(perm, role, ...args);
  }

  public canLocal<T extends PermissionVariant>(
    perm: T,
    role: string,
    ...args: WhereArg<InferPermissionValue<T>>
  ): boolean {
    const map = this.store.get();
    const rolePermissions = map.roles[role];

    if (!rolePermissions) {
      return false;
    }

    const value = rolePermissions[perm.action] ?? perm.def;

    if (perm.context.type === 'boolean') {
      return Boolean(value);
    }

    const [where] = args;
    return where?.(value as InferPermissionValue<T>) ?? false;
  }
}
