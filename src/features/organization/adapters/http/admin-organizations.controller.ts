import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Query } from '@nestjs/common';

import { ItemQueryPort, OrganizationQueryPort } from '../../application/ports.js';
import { SearchAdminOrganizationsInteractor } from '../../application/use-cases/admin-organizations-list/search-admin-organizations.interactor.js';
import { AdminCreateOrganizationInteractor } from '../../application/use-cases/create-and-claim-organization/admin-create-organization.interactor.js';
import { RegenerateClaimTokenInteractor } from '../../application/use-cases/create-and-claim-organization/regenerate-claim-token.interactor.js';
import { CreateItemInteractor } from '../../application/use-cases/manage-items/create-item.interactor.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { EmployeeRoleId, MediaId, ItemId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';
import type { ItemWidget } from '@/kernel/domain/vo/widget.js';

@Controller('admin/organizations')
export class AdminOrganizationsController {
  public constructor(
    private readonly searchAdminOrganizations: SearchAdminOrganizationsInteractor,
    private readonly adminCreateOrganization: AdminCreateOrganizationInteractor,
    private readonly createItemInteractor: CreateItemInteractor,
    private readonly regenerateClaimToken: RegenerateClaimTokenInteractor,
    @Inject(ItemQueryPort) private readonly itemQuery: ItemQueryPort,
    @Inject(OrganizationQueryPort) private readonly organizationQuery: OrganizationQueryPort,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  @Get()
  public async search(
    @Query('query') query?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('size') size?: string,
  ): Promise<PublicResponse['searchAdminOrganizations']> {
    const result = await this.searchAdminOrganizations.execute({
      query,
      status,
      from: from ? Number(from) : undefined,
      size: size ? Number(size) : undefined,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'searchAdminOrganizations'>(result.error.toResponse());
    }

    return result.value;
  }

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
      avatarId: body.avatarId ? MediaId.raw(body.avatarId) : null,
      media: (body.media ?? []).map((m) => ({ type: m.type, mediaId: MediaId.raw(m.mediaId) })),
      adminRoleId,
      claimToken,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'adminCreateOrganization'>(result.error.toResponse());
    }

    return { id: orgId, claimToken: result.value.claimToken };
  }

  @Post(':orgId/items')
  public async createItem(
    @Param('orgId') orgId: string,
    @Body() body: PublicBody['adminCreateItem'],
  ): Promise<PublicResponse['adminCreateItem']> {
    const itemId = ItemId.raw(crypto.randomUUID());

    const result = await this.createItemInteractor.execute({
      organizationId: OrganizationId.raw(orgId),
      itemId,
      typeId: TypeId.raw(body.typeId),
      widgets: body.widgets.map(({ type, data }) => ({ type, ...data })) as unknown as ItemWidget[],
    });

    if (isLeft(result)) {
      throw domainToHttpError<'adminCreateItem'>(result.error.toResponse());
    }

    const detail = await this.itemQuery.findDetail(itemId);
    // biome-ignore lint/style/noNonNullAssertion: item was just created
    return this.toItemDetailResponse(detail!);
  }

  @Get(':id/claim-token')
  public async getClaimToken(@Param('id') id: string): Promise<{ claimToken: string | null }> {
    const auth = await this.permissionCheck.mustCan(Permissions.manageOrganization);
    if (isLeft(auth)) {
      throw domainToHttpError<'getClaimToken'>(auth.error.toResponse());
    }

    const claimToken = await this.organizationQuery.findClaimToken(OrganizationId.raw(id));
    return { claimToken };
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

  private toItemDetailResponse(
    detail: NonNullable<Awaited<ReturnType<ItemQueryPort['findDetail']>>>,
  ): PublicResponse['adminCreateItem'] {
    return {
      itemId: detail.itemId,
      organizationId: detail.organizationId,
      typeId: detail.typeId,
      draft: detail.draft
        ? {
            widgets: detail.draft.widgets.map(this.toSchemaWidget),
            status: detail.draft.status,
            updatedAt: detail.draft.updatedAt.toISOString(),
          }
        : null,
      publication: detail.publication
        ? {
            widgets: detail.publication.widgets.map(this.toSchemaWidget),
            publishedAt: detail.publication.publishedAt.toISOString(),
          }
        : null,
      createdAt: detail.createdAt.toISOString(),
      updatedAt: detail.updatedAt.toISOString(),
    };
  }

  private toSchemaWidget({ type, ...data }: ItemWidget) {
    return { type, data };
  }
}
