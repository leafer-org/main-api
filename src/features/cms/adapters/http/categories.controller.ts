import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';

import { AddAttributeInteractor } from '../../application/use-cases/category/add-attribute.interactor.js';
import { CreateCategoryInteractor } from '../../application/use-cases/category/create-category.interactor.js';
import { GetCategoryDetailInteractor } from '../../application/use-cases/category/get-category-detail.interactor.js';
import { GetCategoryListInteractor } from '../../application/use-cases/category/get-category-list.interactor.js';
import { PublishCategoryInteractor } from '../../application/use-cases/category/publish-category.interactor.js';
import { RemoveAttributeInteractor } from '../../application/use-cases/category/remove-attribute.interactor.js';
import { UnpublishCategoryInteractor } from '../../application/use-cases/category/unpublish-category.interactor.js';
import { UpdateCategoryInteractor } from '../../application/use-cases/category/update-category.interactor.js';
import type { CategoryEntity } from '../../domain/aggregates/category/entity.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse, PublicSchemas } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { AttributeId, CategoryId, FileId, TypeId } from '@/kernel/domain/ids.js';

function toCategoryDetailDto(state: Readonly<CategoryEntity>): PublicSchemas['CmsCategoryDetail'] {
  return {
    id: state.id,
    parentCategoryId: state.parentCategoryId,
    name: state.name,
    iconId: state.iconId,
    allowedTypeIds: state.allowedTypeIds,
    attributes: state.attributes.map((a) => ({
      attributeId: a.attributeId,
      name: a.name,
      required: a.required,
      schema: a.schema,
    })),
    status: state.status,
    publishedAt: state.publishedAt?.toISOString() ?? null,
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
  };
}

@Controller('cms/categories')
export class CategoriesController {
  public constructor(
    private readonly createCategory: CreateCategoryInteractor,
    private readonly updateCategory: UpdateCategoryInteractor,
    private readonly publishCategory: PublishCategoryInteractor,
    private readonly unpublishCategory: UnpublishCategoryInteractor,
    private readonly addAttribute: AddAttributeInteractor,
    private readonly removeAttribute: RemoveAttributeInteractor,
    private readonly getCategoryList: GetCategoryListInteractor,
    private readonly getCategoryDetail: GetCategoryDetailInteractor,
  ) {}

  @Get()
  public async list(): Promise<PublicResponse['getCmsCategories']> {
    const result = await this.getCategoryList.execute();
    if (isLeft(result)) throw domainToHttpError<'getCmsCategories'>(result.error.toResponse());
    return result.value;
  }

  @Get(':id')
  public async getById(@Param('id') id: string): Promise<PublicResponse['getCmsCategoryDetail']> {
    const result = await this.getCategoryDetail.execute({ id: CategoryId.raw(id) });
    if (isLeft(result)) throw domainToHttpError<'getCmsCategoryDetail'>(result.error.toResponse());
    return toCategoryDetailDto(result.value);
  }

  @Post()
  public async create(
    @Body() body: PublicBody['createCmsCategory'],
  ): Promise<PublicResponse['createCmsCategory']> {
    const result = await this.createCategory.execute({
      id: CategoryId.raw(body.id),
      parentCategoryId: body.parentCategoryId ? CategoryId.raw(body.parentCategoryId) : null,
      name: body.name,
      iconId: body.iconId ? FileId.raw(body.iconId) : null,
      allowedTypeIds: body.allowedTypeIds.map((typeId) => TypeId.raw(typeId)),
    });

    if (isLeft(result)) throw domainToHttpError<'createCmsCategory'>(result.error.toResponse());
    return toCategoryDetailDto(result.value);
  }

  @Patch(':id')
  public async update(
    @Param('id') id: string,
    @Body() body: PublicBody['updateCmsCategory'],
  ): Promise<PublicResponse['updateCmsCategory']> {
    const result = await this.updateCategory.execute({
      id: CategoryId.raw(id),
      name: body.name,
      iconId: body.iconId ? FileId.raw(body.iconId) : null,
      parentCategoryId: body.parentCategoryId ? CategoryId.raw(body.parentCategoryId) : null,
      allowedTypeIds: body.allowedTypeIds.map((typeId) => TypeId.raw(typeId)),
    });

    if (isLeft(result)) throw domainToHttpError<'updateCmsCategory'>(result.error.toResponse());
    return toCategoryDetailDto(result.value);
  }

  @Post(':id/publish')
  @HttpCode(200)
  public async publish(@Param('id') id: string): Promise<PublicResponse['publishCmsCategory']> {
    const result = await this.publishCategory.execute({ id: CategoryId.raw(id) });
    if (isLeft(result)) throw domainToHttpError<'publishCmsCategory'>(result.error.toResponse());
    return {};
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  public async unpublish(@Param('id') id: string): Promise<PublicResponse['unpublishCmsCategory']> {
    const result = await this.unpublishCategory.execute({ id: CategoryId.raw(id) });
    if (isLeft(result)) throw domainToHttpError<'unpublishCmsCategory'>(result.error.toResponse());
    return {};
  }

  @Post(':id/attributes')
  @HttpCode(200)
  public async assignAttribute(
    @Param('id') id: string,
    @Body() body: PublicBody['addCmsCategoryAttribute'],
  ): Promise<PublicResponse['addCmsCategoryAttribute']> {
    const result = await this.addAttribute.execute({
      categoryId: CategoryId.raw(id),
      attributeId: AttributeId.raw(body.attributeId),
      name: body.name,
      required: body.required,
      schema: body.schema,
    });

    if (isLeft(result))
      throw domainToHttpError<'addCmsCategoryAttribute'>(result.error.toResponse());
    return {};
  }

  @Delete(':id/attributes/:attributeId')
  @HttpCode(200)
  public async unassignAttribute(
    @Param('id') id: string,
    @Param('attributeId') attributeId: string,
  ): Promise<PublicResponse['removeCmsCategoryAttribute']> {
    const result = await this.removeAttribute.execute({
      categoryId: CategoryId.raw(id),
      attributeId: AttributeId.raw(attributeId),
    });

    if (isLeft(result))
      throw domainToHttpError<'removeCmsCategoryAttribute'>(result.error.toResponse());
    return {};
  }
}
