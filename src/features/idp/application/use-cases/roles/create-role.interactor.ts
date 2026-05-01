import { Inject, Injectable } from '@nestjs/common';

import { RoleEntity } from '../../../domain/aggregates/role/entity.js';
import { IdGenerator, RoleRepository } from '../../ports.js';
import { validatePermissions } from './validate-permissions.js';
import { isLeft } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class CreateRoleInteractor {
  public constructor(
    @Inject(RoleRepository) private readonly roleRepository: RoleRepository,
    @Inject(IdGenerator) private readonly idGenerator: IdGenerator,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { name: string; permissions: unknown }) {
    const auth = await this.permissionCheck.mustCan(Permission.RoleCreate);
    if (isLeft(auth)) return auth;

    const validated = validatePermissions(command.permissions);
    if (isLeft(validated)) return validated;

    return this.txHost.startTransaction(async (tx) => {
      const existing = await this.roleRepository.findByName(tx, command.name);
      const id = this.idGenerator.generateRoleId();
      const now = this.clock.now();

      const result = RoleEntity.create(existing, {
        type: 'CreateRole',
        id,
        name: command.name,
        permissions: validated.value,
        now,
      });

      if (isLeft(result)) return result;

      await this.roleRepository.save(tx, result.value.state);

      return { type: 'success' as const, value: result.value.state };
    });
  }
}
