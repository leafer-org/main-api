import { Inject, Injectable } from '@nestjs/common';

import { isLeft, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { PERMISSION_GROUPS } from '@/kernel/domain/permission-groups.js';
import { Permission, PERMISSION_META } from '@/kernel/domain/permissions.js';

export type PermissionItem = {
  id: string;
  title: string;
  description: string;
};

export type PermissionGroupItem = {
  id: string;
  title: string;
  permissions: PermissionItem[];
};

export function buildPermissionsCatalog(): PermissionGroupItem[] {
  return PERMISSION_GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    permissions: g.permissions.map((p) => ({
      id: PERMISSION_META[p].id,
      title: PERMISSION_META[p].title,
      description: PERMISSION_META[p].description,
    })),
  }));
}

@Injectable()
export class GetPermissionsSchemaInteractor {
  public constructor(
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute() {
    const auth = await this.permissionCheck.mustCan(Permission.RoleRead);
    if (isLeft(auth)) return auth;

    return Right({ groups: buildPermissionsCatalog() });
  }
}
