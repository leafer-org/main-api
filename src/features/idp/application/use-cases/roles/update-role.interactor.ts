import { Inject, Injectable } from '@nestjs/common';

import { roleApply } from '../../../domain/aggregates/role/apply.js';
import { roleDecide } from '../../../domain/aggregates/role/decide.js';
import { RoleNotFoundError } from '../../../domain/aggregates/role/errors.js';
import { RoleRepository } from '../../ports.js';
import { PermissionsStore } from '@/infra/auth/authz/permissions-store.js';
import { isLeft, Left } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { RoleId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class UpdateRoleInteractor {
  public constructor(
    @Inject(RoleRepository) private readonly roleRepository: RoleRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionsStore) private readonly permissionsStore: PermissionsStore,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { roleId: RoleId; permissions: Record<string, unknown> }) {
    const auth = this.permissionCheck.mustCan(Permissions.manageRole);
    if (isLeft(auth)) return auth;

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.roleRepository.findById(tx, command.roleId);

      if (!state) return Left(new RoleNotFoundError());

      const now = this.clock.now();
      const eventEither = roleDecide(state, {
        type: 'UpdateRole',
        permissions: command.permissions,
        now,
      });

      if (isLeft(eventEither)) return eventEither;

      const newState = roleApply(state, eventEither.value);
      await this.roleRepository.save(tx, newState);
      await this.permissionsStore.refresh();

      return { type: 'success' as const, value: newState };
    });
  }
}
