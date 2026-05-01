import { Inject, Injectable } from '@nestjs/common';

import { RoleEntity } from '../../../domain/aggregates/role/entity.js';
import { RoleNotFoundError } from '../../../domain/aggregates/role/errors.js';
import { RoleRepository } from '../../ports.js';
import { validatePermissions } from './validate-permissions.js';
import { isLeft, Left } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { RoleId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class UpdateRoleInteractor {
  public constructor(
    @Inject(RoleRepository) private readonly roleRepository: RoleRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { roleId: RoleId; permissions: unknown }) {
    const auth = await this.permissionCheck.mustCan(Permission.RoleUpdate);
    if (isLeft(auth)) return auth;

    const validated = validatePermissions(command.permissions);
    if (isLeft(validated)) return validated;

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.roleRepository.findById(tx, command.roleId);

      if (!state) return Left(new RoleNotFoundError());

      const now = this.clock.now();
      const result = RoleEntity.update(state, {
        type: 'UpdateRole',
        permissions: validated.value,
        now,
      });

      if (isLeft(result)) return result;

      await this.roleRepository.save(tx, result.value.state);

      return { type: 'success' as const, value: result.value.state };
    });
  }
}
