import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';

import { CreateOrganizationInteractor } from '../../application/use-cases/manage-org/create-organization.interactor.js';
import { GetOrganizationDetailInteractor } from '../../application/use-cases/manage-org/get-organization-detail.interactor.js';
import { UpdateInfoDraftInteractor } from '../../application/use-cases/manage-org/update-info-draft.interactor.js';
import { SubmitInfoForModerationInteractor } from '../../application/use-cases/manage-org/submit-info-for-moderation.interactor.js';
import { OrganizationQueryPort } from '../../application/ports.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { EmployeeRoleId, FileId, OrganizationId } from '@/kernel/domain/ids.js';

@Controller('organizations')
export class OrganizationsController {
  public constructor(
    private readonly createOrganization: CreateOrganizationInteractor,
    private readonly getOrganizationDetail: GetOrganizationDetailInteractor,
    private readonly updateInfoDraft: UpdateInfoDraftInteractor,
    private readonly submitInfoForModeration: SubmitInfoForModerationInteractor,
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
      avatarId: body.avatarId ? FileId.raw(body.avatarId) : null,
      adminRoleId,
    });

    const detail = await this.organizationQuery.findDetail(orgId);
    const employees = await this.organizationQuery.findEmployees(orgId);
    const roles = await this.organizationQuery.findRoles(orgId);

    return this.toOrganizationDetailResponse(detail!, employees, roles);
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
      throw domainToHttpError<'getOrganization'>({ 404: { type: 'organization_not_found', isDomain: true as const } });
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
      avatarId: body.avatarId ? FileId.raw(body.avatarId) : null,
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
        status: detail.infoDraft.status,
      },
      infoPublication: detail.infoPublication
        ? {
            name: detail.infoPublication.name,
            description: detail.infoPublication.description,
            avatarId: detail.infoPublication.avatarId ?? null,
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
