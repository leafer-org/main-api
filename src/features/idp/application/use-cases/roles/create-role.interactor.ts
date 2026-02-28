import { Inject, Injectable } from '@nestjs/common';

import { roleApply } from '../../../domain/aggregates/role/apply.js';
import { roleDecide } from '../../../domain/aggregates/role/decide.js';
import { IdGenerator, RoleRepository } from '../../ports.js';
import { PermissionsStore } from '@/infra/lib/authorization/permissions-store.js';
import { isLeft } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';

@Injectable()
export class CreateRoleInteractor {
  public constructor(
    @Inject(RoleRepository) private readonly roleRepository: RoleRepository,
    @Inject(IdGenerator) private readonly idGenerator: IdGenerator,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionsStore) private readonly permissionsStore: PermissionsStore,
  ) {}

  public async execute(command: { name: string; permissions: Record<string, unknown> }) {
    return this.txHost.startTransaction(async (tx) => {
      const existing = await this.roleRepository.findByName(tx, command.name);
      const id = this.idGenerator.generateRoleId();
      const now = this.clock.now();

      const eventEither = roleDecide(existing, {
        type: 'CreateRole',
        id,
        name: command.name,
        permissions: command.permissions,
        now,
      });

      if (isLeft(eventEither)) return eventEither;

      const state = roleApply(null, eventEither.value);
      await this.roleRepository.save(tx, state);
      await this.permissionsStore.refresh();

      return { type: 'success' as const, value: state };
    });
  }
}
