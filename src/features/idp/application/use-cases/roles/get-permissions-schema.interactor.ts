import { Inject, Injectable } from '@nestjs/common';

import { isLeft, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { Permissions } from '@/kernel/domain/permissions.js';

export type PermissionSchemaItem = {
  action: string;
  key: string;
  type: 'boolean' | 'enum';
  values?: string[];
  default: unknown;
};

export function buildPermissionsSchema(): PermissionSchemaItem[] {
  return Object.entries(Permissions).map(([key, perm]) => ({
    action: perm.action,
    key,
    type: perm.context.type as 'boolean' | 'enum',
    values:
      perm.context.type === 'enum' ? (perm.context as { values: string[] }).values : undefined,
    default: perm.def,
  }));
}

@Injectable()
export class GetPermissionsSchemaInteractor {
  public constructor(
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute() {
    const auth = await this.permissionCheck.mustCan(Permissions.manageRole);
    if (isLeft(auth)) return auth;

    return Right(buildPermissionsSchema());
  }
}
