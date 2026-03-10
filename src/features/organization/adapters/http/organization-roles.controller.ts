import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';

import { GetOrganizationRolesInteractor } from '../../application/use-cases/manage-roles/get-organization-roles.interactor.js';
import { CreateEmployeeRoleInteractor } from '../../application/use-cases/manage-roles/create-employee-role.interactor.js';
import { UpdateEmployeeRoleInteractor } from '../../application/use-cases/manage-roles/update-employee-role.interactor.js';
import { DeleteEmployeeRoleInteractor } from '../../application/use-cases/manage-roles/delete-employee-role.interactor.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { EmployeeRoleId, OrganizationId } from '@/kernel/domain/ids.js';
import type { OrganizationPermission } from '../../domain/aggregates/organization/config.js';

@Controller('organizations/:id/roles')
export class OrganizationRolesController {
  public constructor(
    private readonly getRoles: GetOrganizationRolesInteractor,
    private readonly createRole: CreateEmployeeRoleInteractor,
    private readonly updateRole: UpdateEmployeeRoleInteractor,
    private readonly deleteRole: DeleteEmployeeRoleInteractor,
  ) {}

  @Get()
  public async list(
    @Param('id') id: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['getOrganizationRoles']> {
    const result = await this.getRoles.execute({
      organizationId: OrganizationId.raw(id),
      userId: user.userId,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'getOrganizationRoles'>(result.error.toResponse());
    }

    return result.value.roles.map((r) => ({
      id: r.id as string,
      name: r.name,
      permissions: r.permissions,
    })) as PublicResponse['getOrganizationRoles'];
  }

  @Post()
  public async create(
    @Param('id') id: string,
    @Body() body: PublicBody['createEmployeeRole'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['createEmployeeRole']> {
    const roleId = EmployeeRoleId.raw(crypto.randomUUID());

    const result = await this.createRole.execute({
      organizationId: OrganizationId.raw(id),
      userId: user.userId,
      roleId,
      name: body.name,
      permissions: body.permissions as OrganizationPermission[],
    });

    if (isLeft(result)) {
      throw domainToHttpError<'createEmployeeRole'>(result.error.toResponse());
    }

    return {
      id: roleId as string,
      name: body.name,
      permissions: body.permissions,
    } as PublicResponse['createEmployeeRole'];
  }

  @Patch(':roleId')
  public async update(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @Body() body: PublicBody['updateEmployeeRole'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['updateEmployeeRole']> {
    const result = await this.updateRole.execute({
      organizationId: OrganizationId.raw(id),
      userId: user.userId,
      roleId: EmployeeRoleId.raw(roleId),
      name: body.name,
      permissions: body.permissions as OrganizationPermission[],
    });

    if (isLeft(result)) {
      throw domainToHttpError<'updateEmployeeRole'>(result.error.toResponse());
    }

    return {
      id: roleId,
      name: body.name,
      permissions: body.permissions,
    } as PublicResponse['updateEmployeeRole'];
  }

  @Delete(':roleId')
  @HttpCode(204)
  public async deleteRoleEndpoint(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @Query('replacementRoleId') replacementRoleId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.deleteRole.execute({
      organizationId: OrganizationId.raw(id),
      userId: user.userId,
      roleId: EmployeeRoleId.raw(roleId),
      replacementRoleId: EmployeeRoleId.raw(replacementRoleId),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'deleteEmployeeRole'>(result.error.toResponse());
    }
  }
}
