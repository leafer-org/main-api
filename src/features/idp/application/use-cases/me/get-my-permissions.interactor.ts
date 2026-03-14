import { Inject, Injectable } from '@nestjs/common';

import { PermissionsStore } from '@/infra/auth/authz/permissions-store.js';
import { SessionContext } from '@/infra/auth/session/session-context.js';
import { Right } from '@/infra/lib/box.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetMyPermissionsInteractor {
  public constructor(
    @Inject(PermissionsStore) private readonly store: PermissionsStore,
    @Inject(SessionContext) private readonly sessionContext: SessionContext,
  ) {}

  public async execute() {
    const role = this.sessionContext.getRole();
    const map = await this.store.get();
    const rolePermissions = map.roles[role] ?? {};

    const resolved: Record<string, unknown> = {};

    for (const [key, perm] of Object.entries(Permissions)) {
      resolved[key] = rolePermissions[perm.action] ?? perm.def;
    }

    return Right({ permissions: resolved });
  }
}
