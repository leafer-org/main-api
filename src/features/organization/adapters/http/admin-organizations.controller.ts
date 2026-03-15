import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';

import { AdminCreateOrganizationInteractor } from '../../application/use-cases/create-and-claim-organization/admin-create-organization.interactor.js';
import { RegenerateClaimTokenInteractor } from '../../application/use-cases/create-and-claim-organization/regenerate-claim-token.interactor.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { EmployeeRoleId, FileId, OrganizationId } from '@/kernel/domain/ids.js';

@Controller('admin/organizations')
export class AdminOrganizationsController {
  public constructor(
    private readonly adminCreateOrganization: AdminCreateOrganizationInteractor,
    private readonly regenerateClaimToken: RegenerateClaimTokenInteractor,
  ) {}

  @Post()
  public async create(
    @Body() body: PublicBody['adminCreateOrganization'],
  ): Promise<PublicResponse['adminCreateOrganization']> {
    const orgId = OrganizationId.raw(crypto.randomUUID());
    const adminRoleId = EmployeeRoleId.raw(crypto.randomUUID());
    const claimToken = crypto.randomUUID();

    const result = await this.adminCreateOrganization.execute({
      id: orgId,
      name: body.name,
      description: body.description ?? '',
      avatarId: body.avatarId ? FileId.raw(body.avatarId) : null,
      adminRoleId,
      claimToken,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'adminCreateOrganization'>(result.error.toResponse());
    }

    return { id: orgId, claimToken: result.value.claimToken };
  }

  @Post(':id/regenerate-token')
  @HttpCode(200)
  public async regenerateToken(
    @Param('id') id: string,
  ): Promise<PublicResponse['regenerateClaimToken']> {
    const result = await this.regenerateClaimToken.execute({
      organizationId: OrganizationId.raw(id),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'regenerateClaimToken'>(result.error.toResponse());
    }

    return { claimToken: result.value.claimToken };
  }
}
