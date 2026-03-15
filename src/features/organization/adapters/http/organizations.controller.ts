import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';

import { OrganizationQueryPort } from '../../application/ports.js';
import { ApproveInfoModerationInteractor } from '../../application/use-cases/moderation/approve-info-moderation.interactor.js';
import { ClaimOrganizationInteractor } from '../../application/use-cases/create-and-claim-organization/claim-organization.interactor.js';
import { CreateOrganizationInteractor } from '../../application/use-cases/manage-org/create-organization.interactor.js';
import { DeleteOrganizationInteractor } from '../../application/use-cases/manage-org/delete-organization.interactor.js';
import { GetOrganizationDetailInteractor } from '../../application/use-cases/manage-org/get-organization-detail.interactor.js';
import { RejectInfoModerationInteractor } from '../../application/use-cases/moderation/reject-info-moderation.interactor.js';
import { SubmitInfoForModerationInteractor } from '../../application/use-cases/moderation/submit-info-for-moderation.interactor.js';
import { UnpublishOrganizationInteractor } from '../../application/use-cases/manage-org/unpublish-organization.interactor.js';
import { UpdateInfoDraftInteractor } from '../../application/use-cases/manage-org/update-info-draft.interactor.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { EmployeeRoleId, MediaId, OrganizationId } from '@/kernel/domain/ids.js';

@Controller('organizations')
export class OrganizationsController {
  public constructor(
    private readonly createOrganization: CreateOrganizationInteractor,
    private readonly deleteOrganization: DeleteOrganizationInteractor,
    private readonly claimOrganization: ClaimOrganizationInteractor,
    private readonly getOrganizationDetail: GetOrganizationDetailInteractor,
    private readonly updateInfoDraft: UpdateInfoDraftInteractor,
    private readonly submitInfoForModeration: SubmitInfoForModerationInteractor,
    private readonly approveInfoModeration: ApproveInfoModerationInteractor,
    private readonly rejectInfoModeration: RejectInfoModerationInteractor,
    private readonly unpublishOrganization: UnpublishOrganizationInteractor,
    @Inject(OrganizationQueryPort) private readonly organizationQuery: OrganizationQueryPort,
  ) {}

  @Post()
  public async create(
    @Body() body: PublicBody['createOrganization'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['createOrganization']> {
    const orgId = OrganizationId.raw(crypto.randomUUID());
    const adminRoleId = EmployeeRoleId.raw(crypto.randomUUID());

    await this.createOrganization.execute({
      id: orgId,
      creatorUserId: user.userId,
      name: body.name,
      description: body.description,
      avatarId: body.avatarId ? MediaId.raw(body.avatarId) : null,
      media: (body.media ?? []).map((m) => ({ type: m.type, mediaId: MediaId.raw(m.mediaId) })),
      adminRoleId,
    });

    const detail = await this.organizationQuery.findDetail(orgId);
    const employees = await this.organizationQuery.findEmployees(orgId);
    const roles = await this.organizationQuery.findRoles(orgId);

    return this.toOrganizationDetailResponse(detail!, employees, roles);
  }

  @Post('claim')
  @HttpCode(200)
  public async claim(
    @Body() body: PublicBody['claimOrganization'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['claimOrganization']> {
    const result = await this.claimOrganization.execute({
      token: body.token,
      userId: user.userId,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'claimOrganization'>(result.error.toResponse());
    }

    const orgId = result.value.id;
    const detail = await this.organizationQuery.findDetail(orgId);
    const employees = await this.organizationQuery.findEmployees(orgId);
    const roles = await this.organizationQuery.findRoles(orgId);

    return this.toOrganizationDetailResponse(detail!, employees, roles);
  }

  @Delete(':id')
  @HttpCode(204)
  public async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.deleteOrganization.execute({
      organizationId: OrganizationId.raw(id),
      userId: user.userId,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'deleteOrganization'>(result.error.toResponse());
    }
  }

  @Get(':id')
  public async getDetail(
    @Param('id') id: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['getOrganization']> {
    const orgId = OrganizationId.raw(id);

    const result = await this.getOrganizationDetail.execute({
      organizationId: orgId,
      userId: user.userId,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'getOrganization'>(result.error.toResponse());
    }

    const detail = result.value;
    if (!detail) {
      throw domainToHttpError<'getOrganization'>({
        404: { type: 'organization_not_found', isDomain: true as const },
      });
    }

    const employees = await this.organizationQuery.findEmployees(orgId);
    const roles = await this.organizationQuery.findRoles(orgId);

    return this.toOrganizationDetailResponse(detail, employees, roles);
  }

  @Patch(':id')
  public async update(
    @Param('id') id: string,
    @Body() body: PublicBody['updateInfoDraft'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['updateInfoDraft']> {
    const orgId = OrganizationId.raw(id);

    const result = await this.updateInfoDraft.execute({
      organizationId: orgId,
      userId: user.userId,
      name: body.name,
      description: body.description,
      avatarId: body.avatarId ? MediaId.raw(body.avatarId) : null,
      media: (body.media ?? []).map((m) => ({ type: m.type, mediaId: MediaId.raw(m.mediaId) })),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'updateInfoDraft'>(result.error.toResponse());
    }

    const detail = await this.organizationQuery.findDetail(orgId);
    const employees = await this.organizationQuery.findEmployees(orgId);
    const roles = await this.organizationQuery.findRoles(orgId);

    return this.toOrganizationDetailResponse(detail!, employees, roles);
  }

  @Post(':id/submit-for-moderation')
  @HttpCode(204)
  public async submitForModeration(
    @Param('id') id: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.submitInfoForModeration.execute({
      organizationId: OrganizationId.raw(id),
      userId: user.userId,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'submitInfoForModeration'>(result.error.toResponse());
    }
  }

  @Post(':id/approve-moderation')
  @HttpCode(204)
  public async approveModeration(@Param('id') id: string): Promise<void> {
    const result = await this.approveInfoModeration.execute({
      organizationId: OrganizationId.raw(id),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'approveInfoModeration'>(result.error.toResponse());
    }
  }

  @Post(':id/reject-moderation')
  @HttpCode(204)
  public async rejectModeration(@Param('id') id: string): Promise<void> {
    const result = await this.rejectInfoModeration.execute({
      organizationId: OrganizationId.raw(id),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'rejectInfoModeration'>(result.error.toResponse());
    }
  }

  @Post(':id/unpublish')
  @HttpCode(204)
  public async unpublish(
    @Param('id') id: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.unpublishOrganization.execute({
      organizationId: OrganizationId.raw(id),
      userId: user.userId,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'unpublishOrganization'>(result.error.toResponse());
    }
  }

  private toOrganizationDetailResponse(
    detail: NonNullable<Awaited<ReturnType<OrganizationQueryPort['findDetail']>>>,
    employees: Awaited<ReturnType<OrganizationQueryPort['findEmployees']>>,
    roles: Awaited<ReturnType<OrganizationQueryPort['findRoles']>>,
  ): PublicResponse['getOrganization'] {
    return {
      id: detail.id,
      infoDraft: {
        name: detail.infoDraft.name,
        description: detail.infoDraft.description,
        avatarId: detail.infoDraft.avatarId ?? null,
        media: detail.infoDraft.media.map((m) => ({ type: m.type, mediaId: m.mediaId as string })),
        status: detail.infoDraft.status,
      },
      infoPublication: detail.infoPublication
        ? {
            name: detail.infoPublication.name,
            description: detail.infoPublication.description,
            avatarId: detail.infoPublication.avatarId ?? null,
            media: detail.infoPublication.media.map((m) => ({ type: m.type, mediaId: m.mediaId as string })),
            publishedAt: detail.infoPublication.publishedAt.toISOString(),
          }
        : null,
      employees: employees.employees.map((e) => ({
        userId: e.userId,
        roleId: e.roleId,
        isOwner: e.isOwner,
        joinedAt: e.joinedAt.toISOString(),
      })),
      roles: roles.roles.map((r) => ({
        id: r.id,
        name: r.name,
        permissions: r.permissions,
      })),
      subscription: {
        planId: detail.subscription.planId,
        maxEmployees: detail.subscription.maxEmployees,
        maxPublishedItems: detail.subscription.maxPublishedItems,
        availableWidgetTypes: detail.subscription.availableWidgetTypes,
      },
      createdAt: detail.createdAt.toISOString(),
      updatedAt: detail.updatedAt.toISOString(),
    };
  }
}
