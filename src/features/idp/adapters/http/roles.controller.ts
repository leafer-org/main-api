import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';

import { GetPermissionsSchemaInteractor } from '../../application/use-cases/roles/get-permissions-schema.interactor.js';
import { GetRoleInteractor } from '../../application/use-cases/roles/get-role.interactor.js';
import { GetRolesListInteractor } from '../../application/use-cases/roles/get-roles-list.interactor.js';
import { CreateRoleInteractor } from '../../application/use-cases/roles/create-role.interactor.js';
import { DeleteRoleInteractor } from '../../application/use-cases/roles/delete-role.interactor.js';
import { UpdateRoleInteractor } from '../../application/use-cases/roles/update-role.interactor.js';
import { UpdateUserRoleInteractor } from '../../application/use-cases/roles/update-user-role.interactor.js';
import type { RoleReadModel } from '../../domain/read-models/role.read-model.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse, PublicSchemas } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { RoleId, UserId } from '@/kernel/domain/ids.js';

function serializeRole(role: RoleReadModel): PublicSchemas['Role'] {
  return {
    id: role.id as string,
    name: role.name,
    permissions: role.permissions,
    isStatic: role.isStatic,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

@Controller('roles')
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
  public async list(): Promise<PublicResponse['getRoles']> {
    const result = await this.getRolesList.execute();

    if (isLeft(result)) {
      throw domainToHttpError<'getRoles'>(result.error.toResponse());
    }

    return { roles: result.value.roles.map(serializeRole) };
  }

  @Get('permissions-schema')
  public async getSchema(): Promise<PublicResponse['getPermissionsSchema']> {
    const result = await this.getPermissionsSchema.execute();

    if (isLeft(result)) {
      throw domainToHttpError<'getPermissionsSchema'>(result.error.toResponse());
    }

    return result.value;
  }

  @Get(':roleId')
  public async getById(@Param('roleId') roleId: string): Promise<PublicResponse['getRole']> {
    const result = await this.getRole.execute({ roleId: RoleId.raw(roleId) });

    if (isLeft(result)) {
      throw domainToHttpError<'getRole'>(result.error.toResponse());
    }

    return serializeRole(result.value);
  }

  @Post()
  public async create(
    @Body() body: PublicBody['createRole'],
  ): Promise<PublicResponse['createRole']> {
    const result = await this.createRole.execute({
      name: body.name,
      permissions: body.permissions ?? {},
    });

    if (isLeft(result)) {
      throw domainToHttpError<'createRole'>(result.error.toResponse());
    }

    return serializeRole(result.value);
  }

  @Patch(':roleId')
  public async update(
    @Param('roleId') roleId: string,
    @Body() body: PublicBody['updateRole'],
  ): Promise<PublicResponse['updateRole']> {
    const result = await this.updateRole.execute({
      roleId: RoleId.raw(roleId),
      permissions: body.permissions,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'updateRole'>(result.error.toResponse());
    }

    return serializeRole(result.value);
  }

  @Delete(':roleId')
  @HttpCode(200)
  public async remove(
    @Param('roleId') roleId: string,
    @Body() body: PublicBody['deleteRole'],
  ): Promise<PublicResponse['deleteRole']> {
    const result = await this.deleteRole.execute({
      roleId: RoleId.raw(roleId),
      replacementRoleId: RoleId.raw(body.replacementRoleId),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'deleteRole'>(result.error.toResponse());
    }

    return {};
  }
}

@Controller('users')
export class UsersRoleController {
  public constructor(private readonly updateUserRole: UpdateUserRoleInteractor) {}

  @Patch(':userId/role')
  public async updateRole(
    @Param('userId') userId: string,
    @Body() body: PublicBody['updateUserRole'],
  ): Promise<PublicResponse['updateUserRole']> {
    const result = await this.updateUserRole.execute({
      userId: UserId.raw(userId),
      roleId: RoleId.raw(body.roleId),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'updateUserRole'>(result.error.toResponse());
    }

    return {};
  }
}
