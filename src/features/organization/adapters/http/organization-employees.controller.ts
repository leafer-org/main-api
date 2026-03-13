import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';

import { ChangeEmployeeRoleInteractor } from '../../application/use-cases/manage-employees/change-employee-role.interactor.js';
import { GetOrganizationEmployeesInteractor } from '../../application/use-cases/manage-employees/get-organization-employees.interactor.js';
import { InviteEmployeeInteractor } from '../../application/use-cases/manage-employees/invite-employee.interactor.js';
import { RemoveEmployeeInteractor } from '../../application/use-cases/manage-employees/remove-employee.interactor.js';
import { TransferOwnershipInteractor } from '../../application/use-cases/manage-employees/transfer-ownership.interactor.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { EmployeeRoleId, OrganizationId, UserId } from '@/kernel/domain/ids.js';

@Controller('organizations/:id')
export class OrganizationEmployeesController {
  public constructor(
    private readonly getEmployees: GetOrganizationEmployeesInteractor,
    private readonly inviteEmployee: InviteEmployeeInteractor,
    private readonly removeEmployee: RemoveEmployeeInteractor,
    private readonly changeEmployeeRole: ChangeEmployeeRoleInteractor,
    private readonly transferOwnership: TransferOwnershipInteractor,
  ) {}

  @Get('employees')
  public async list(
    @Param('id') id: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['getOrganizationEmployees']> {
    const result = await this.getEmployees.execute({
      organizationId: OrganizationId.raw(id),
      userId: user.userId,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'getOrganizationEmployees'>(result.error.toResponse());
    }

    return result.value.employees.map((e) => ({
      userId: e.userId,
      roleId: e.roleId,
      isOwner: e.isOwner,
      joinedAt: e.joinedAt.toISOString(),
    }));
  }

  @Post('employees')
  public async invite(
    @Param('id') id: string,
    @Body() body: PublicBody['inviteEmployee'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['inviteEmployee']> {
    const result = await this.inviteEmployee.execute({
      organizationId: OrganizationId.raw(id),
      userId: user.userId,
      phone: body.phone,
      roleId: EmployeeRoleId.raw(body.roleId),
    });

    if (isLeft(result)) {
      throw domainToHttpError(result.error.toResponse());
    }

    return result.value as unknown as PublicResponse['inviteEmployee'];
  }

  @Delete('employees/:userId')
  @HttpCode(204)
  public async remove(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.removeEmployee.execute({
      organizationId: OrganizationId.raw(id),
      userId: user.userId,
      targetUserId: UserId.raw(userId),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'removeEmployee'>(result.error.toResponse());
    }
  }

  @Patch('employees/:userId')
  public async changeRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: PublicBody['changeEmployeeRole'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['changeEmployeeRole']> {
    const result = await this.changeEmployeeRole.execute({
      organizationId: OrganizationId.raw(id),
      userId: user.userId,
      targetUserId: UserId.raw(userId),
      roleId: EmployeeRoleId.raw(body.roleId),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'changeEmployeeRole'>(result.error.toResponse());
    }

    return result.value as unknown as PublicResponse['changeEmployeeRole'];
  }

  @Post('transfer-ownership')
  @HttpCode(204)
  public async transfer(
    @Param('id') id: string,
    @Body() body: PublicBody['transferOwnership'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.transferOwnership.execute({
      organizationId: OrganizationId.raw(id),
      userId: user.userId,
      toUserId: UserId.raw(body.userId),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'transferOwnership'>(result.error.toResponse());
    }
  }
}
