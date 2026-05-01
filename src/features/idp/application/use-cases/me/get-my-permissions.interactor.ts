import { Inject, Injectable } from '@nestjs/common';

import { PermissionsStore } from '@/infra/auth/authz/permissions-store.js';
import { SessionContext } from '@/infra/auth/session/session-context.js';
import { Right } from '@/infra/lib/box.js';

@Injectable()
export class GetMyPermissionsInteractor {
  public constructor(
    @Inject(PermissionsStore) private readonly store: PermissionsStore,
    @Inject(SessionContext) private readonly sessionContext: SessionContext,
  ) {}

  public async execute() {
    const role = this.sessionContext.getRole();
    const map = await this.store.get();
    const permissions = map.roles[role] ?? [];

    return Right({ permissions: [...permissions] });
  }
}
