import { Injectable } from '@nestjs/common';

import { RoleNotFoundError } from '../../../domain/aggregates/role/errors.js';
import { RoleQueryPort } from '../../ports.js';
import { Left, Right } from '@/infra/lib/box.js';
import type { RoleId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetRoleInteractor {
  public constructor(private readonly roleQuery: RoleQueryPort) {}

  public async execute(command: { roleId: RoleId }) {
    const readModel = await this.roleQuery.findRole(command.roleId);

    if (!readModel) return Left(new RoleNotFoundError());

    return Right(readModel);
  }
}
