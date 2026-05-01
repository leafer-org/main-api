import { Inject, Injectable } from '@nestjs/common';

import { SessionContext } from '../session/session-context.js';
import { PermissionsStore } from './permissions-store.js';
import type { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class PermissionService {
  public constructor(
    @Inject(PermissionsStore) private readonly store: PermissionsStore,
    @Inject(SessionContext) private readonly sessionContext: SessionContext,
  ) {}

  public async can(perm: Permission): Promise<boolean> {
    const role = this.sessionContext.getRole();
    return this.canLocal(perm, role);
  }

  public async canLocal(perm: Permission, role: string): Promise<boolean> {
    const map = await this.store.get();
    const rolePermissions = map.roles[role];
    if (!rolePermissions) return false;
    return rolePermissions.includes(perm);
  }
}
