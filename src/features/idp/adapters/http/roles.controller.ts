import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { GetPermissionsSchemaInteractor } from '../../application/queries/roles/get-permissions-schema.interactor.js';
import { GetRoleInteractor } from '../../application/queries/roles/get-role.interactor.js';
import { GetRolesListInteractor } from '../../application/queries/roles/get-roles-list.interactor.js';
import { CreateRoleInteractor } from '../../application/use-cases/roles/create-role.interactor.js';
import { DeleteRoleInteractor } from '../../application/use-cases/roles/delete-role.interactor.js';
import { UpdateRoleInteractor } from '../../application/use-cases/roles/update-role.interactor.js';
import { UpdateUserRoleInteractor } from '../../application/use-cases/roles/update-user-role.interactor.js';
import {
  RoleAlreadyExistsError,
  StaticRoleModificationError,
} from '../../domain/aggregates/role/errors.js';
import { JwtAuthGuard } from '@/infra/auth/jwt-auth.guard.js';
import { PermissionGuard } from '@/infra/lib/authorization/permission.guard.js';
import { RequirePermission } from '@/infra/lib/authorization/require-permission.decorator.js';
import { isLeft } from '@/infra/lib/box.js';
import { RoleId, UserId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission((can) => can(Permissions.manageRole))
export class RolesController {
  public constructor(
    private readonly createRole: CreateRoleInteractor,
    private readonly updateRole: UpdateRoleInteractor,
    private readonly deleteRole: DeleteRoleInteractor,
    private readonly getRole: GetRoleInteractor,
    private readonly getRolesList: GetRolesListInteractor,
    private readonly getPermissionsSchema: GetPermissionsSchemaInteractor,
  ) {}

  @Get()
  public async list() {
    const result = await this.getRolesList.execute();
    return result.value;
  }

  @Get('permissions-schema')
  public getSchema() {
    const result = this.getPermissionsSchema.execute();
    return result.value;
  }

  @Get(':roleId')
  public async getById(@Param('roleId') roleId: string) {
    const result = await this.getRole.execute({ roleId: RoleId.raw(roleId) });

    if (isLeft(result)) {
      throw new NotFoundException({ code: result.error.type });
    }

    return result.value;
  }

  @Post()
  public async create(@Body() body: { name: string; permissions: Record<string, unknown> }) {
    const result = await this.createRole.execute({
      name: body.name,
      permissions: body.permissions ?? {},
    });

    if (isLeft(result)) {
      if (result.error instanceof RoleAlreadyExistsError) {
        throw new BadRequestException({ code: result.error.type });
      }
      throw new BadRequestException({ code: result.error.type });
    }

    return result.value;
  }

  @Patch(':roleId')
  public async update(
    @Param('roleId') roleId: string,
    @Body() body: { permissions: Record<string, unknown> },
  ) {
    const result = await this.updateRole.execute({
      roleId: RoleId.raw(roleId),
      permissions: body.permissions,
    });

    if (isLeft(result)) {
      if (result.error instanceof StaticRoleModificationError) {
        throw new ForbiddenException({ code: result.error.type });
      }
      throw new NotFoundException({ code: result.error.type });
    }

    return result.value;
  }

  @Delete(':roleId')
  @HttpCode(200)
  public async remove(
    @Param('roleId') roleId: string,
    @Body() body: { replacementRoleId: string },
  ) {
    const result = await this.deleteRole.execute({
      roleId: RoleId.raw(roleId),
      replacementRoleId: RoleId.raw(body.replacementRoleId),
    });

    if (isLeft(result)) {
      if (result.error instanceof StaticRoleModificationError) {
        throw new ForbiddenException({ code: result.error.type });
      }
      throw new NotFoundException({ code: result.error.type });
    }

    return {};
  }
}

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission((can) => can(Permissions.manageRole))
export class UsersRoleController {
  public constructor(private readonly updateUserRole: UpdateUserRoleInteractor) {}

  @Patch(':userId/role')
  public async updateRole(@Param('userId') userId: string, @Body() body: { roleId: string }) {
    const result = await this.updateUserRole.execute({
      userId: UserId.raw(userId),
      roleId: RoleId.raw(body.roleId),
    });

    if (isLeft(result)) {
      throw new NotFoundException({ code: result.error.type });
    }

    return {};
  }
}
