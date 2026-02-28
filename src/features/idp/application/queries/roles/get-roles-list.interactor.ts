import { Injectable } from '@nestjs/common';

import { RolesListQueryPort } from '../../ports.js';
import { Right } from '@/infra/lib/box.js';

@Injectable()
export class GetRolesListInteractor {
  public constructor(private readonly rolesListQuery: RolesListQueryPort) {}

  public async execute() {
    const readModel = await this.rolesListQuery.findAll();

    return Right(readModel);
  }
}
