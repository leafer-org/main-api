import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';

import { CreateItemInteractor } from '../../application/use-cases/manage-items/create-item.interactor.js';
import { UpdateItemDraftInteractor } from '../../application/use-cases/manage-items/update-item-draft.interactor.js';
import { DeleteItemDraftInteractor } from '../../application/use-cases/manage-items/delete-item-draft.interactor.js';
import { SubmitItemForModerationInteractor } from '../../application/use-cases/manage-items/submit-item-for-moderation.interactor.js';
import { UnpublishItemInteractor } from '../../application/use-cases/manage-items/unpublish-item.interactor.js';
import { GetOrganizationItemsInteractor } from '../../application/use-cases/manage-items/get-organization-items.interactor.js';
import { GetItemDetailInteractor } from '../../application/use-cases/manage-items/get-item-detail.interactor.js';
import { ItemQueryPort } from '../../application/ports.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { ItemId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';
import type { ItemWidget } from '@/kernel/domain/vo/widget.js';

@Controller('organizations/:orgId/items')
export class ItemsController {
  public constructor(
    private readonly createItem: CreateItemInteractor,
    private readonly updateItemDraft: UpdateItemDraftInteractor,
    private readonly deleteItemDraft: DeleteItemDraftInteractor,
    private readonly submitItemForModeration: SubmitItemForModerationInteractor,
    private readonly unpublishItem: UnpublishItemInteractor,
    private readonly getOrganizationItems: GetOrganizationItemsInteractor,
    private readonly getItemDetail: GetItemDetailInteractor,
    @Inject(ItemQueryPort) private readonly itemQuery: ItemQueryPort,
  ) {}

  @Post()
  public async create(
    @Param('orgId') orgId: string,
    @Body() body: PublicBody['createItem'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['createItem']> {
    const itemId = ItemId.raw(crypto.randomUUID());

    const result = await this.createItem.execute({
      organizationId: OrganizationId.raw(orgId),
      userId: user.userId,
      itemId,
      typeId: TypeId.raw(body.typeId),
      widgets: body.widgets as unknown as ItemWidget[],
    });

    if (isLeft(result)) {
      throw domainToHttpError<'createItem'>(result.error.toResponse());
    }

    const detail = await this.itemQuery.findDetail(itemId);

    return this.toItemDetailResponse(detail!);
  }

  @Get()
  public async list(
    @Param('orgId') orgId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['getOrganizationItems']> {
    const result = await this.getOrganizationItems.execute({
      organizationId: OrganizationId.raw(orgId),
      userId: user.userId,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'getOrganizationItems'>(result.error.toResponse());
    }

    return result.value.items.map((item) => ({
      itemId: item.itemId,
      organizationId: orgId,
      typeId: item.typeId,
      hasDraft: item.draftStatus !== null,
      draftStatus: item.draftStatus,
      hasPublication: item.hasPublication,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));
  }

  @Get(':itemId')
  public async detail(
    @Param('orgId') orgId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['getItemDetail']> {
    const result = await this.getItemDetail.execute({
      organizationId: OrganizationId.raw(orgId),
      userId: user.userId,
      itemId: ItemId.raw(itemId),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'getItemDetail'>(result.error.toResponse());
    }

    if (!result.value) {
      throw domainToHttpError<'getItemDetail'>({ 404: { type: 'item_not_found', isDomain: true as const } });
    }

    return this.toItemDetailResponse(result.value);
  }

  @Patch(':itemId')
  public async update(
    @Param('orgId') orgId: string,
    @Param('itemId') itemId: string,
    @Body() body: PublicBody['updateItemDraft'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['updateItemDraft']> {
    const result = await this.updateItemDraft.execute({
      organizationId: OrganizationId.raw(orgId),
      userId: user.userId,
      itemId: ItemId.raw(itemId),
      widgets: body.widgets as unknown as ItemWidget[],
    });

    if (isLeft(result)) {
      throw domainToHttpError<'updateItemDraft'>(result.error.toResponse());
    }

    const detail = await this.itemQuery.findDetail(ItemId.raw(itemId));

    return this.toItemDetailResponse(detail!);
  }

  @Delete(':itemId')
  @HttpCode(204)
  public async deleteDraft(
    @Param('orgId') orgId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.deleteItemDraft.execute({
      organizationId: OrganizationId.raw(orgId),
      userId: user.userId,
      itemId: ItemId.raw(itemId),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'deleteItemDraft'>(result.error.toResponse());
    }
  }

  @Post(':itemId/submit-for-moderation')
  @HttpCode(204)
  public async submitForModeration(
    @Param('orgId') orgId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.submitItemForModeration.execute({
      organizationId: OrganizationId.raw(orgId),
      userId: user.userId,
      itemId: ItemId.raw(itemId),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'submitItemForModeration'>(result.error.toResponse());
    }
  }

  @Post(':itemId/unpublish')
  @HttpCode(204)
  public async unpublish(
    @Param('orgId') orgId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.unpublishItem.execute({
      organizationId: OrganizationId.raw(orgId),
      userId: user.userId,
      itemId: ItemId.raw(itemId),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'unpublishItem'>(result.error.toResponse());
    }
  }

  private toItemDetailResponse(
    detail: NonNullable<Awaited<ReturnType<ItemQueryPort['findDetail']>>>,
  ): PublicResponse['getItemDetail'] {
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
