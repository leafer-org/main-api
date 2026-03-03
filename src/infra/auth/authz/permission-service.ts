import { Injectable } from '@nestjs/common';

import { SessionContext } from '../session/session-context.js';
import { PermissionsStore } from './permissions-store.js';
import type { InferPermissionValue, PermissionVariant } from './schema.js';

export type WhereArg<T> = [T] extends [boolean] ? [] : [where: (value: T) => boolean];

@Injectable()
export class PermissionService {
  public constructor(
    private readonly store: PermissionsStore,
    private readonly sessionContext: SessionContext,
  ) {}

  public async can<T extends PermissionVariant>(
    perm: T,
    ...args: WhereArg<InferPermissionValue<T>>
  ): Promise<boolean> {
    const role = this.sessionContext.getRole();
    return this.canLocal(perm, role, ...args);
  }

  public async canLocal<T extends PermissionVariant>(
    perm: T,
    role: string,
    ...args: WhereArg<InferPermissionValue<T>>
  ): Promise<boolean> {
    const map = await this.store.get();
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
