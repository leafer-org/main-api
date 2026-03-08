import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { AddAttributeInteractor } from '../../application/use-cases/category/add-attribute.interactor.js';
import { CreateCategoryInteractor } from '../../application/use-cases/category/create-category.interactor.js';
import { GetCategoryDetailInteractor } from '../../application/use-cases/category/get-category-detail.interactor.js';
import { GetCategoryListInteractor } from '../../application/use-cases/category/get-category-list.interactor.js';
import { PublishCategoryInteractor } from '../../application/use-cases/category/publish-category.interactor.js';
import { RemoveAttributeInteractor } from '../../application/use-cases/category/remove-attribute.interactor.js';
import { UnpublishCategoryInteractor } from '../../application/use-cases/category/unpublish-category.interactor.js';
import { UpdateCategoryInteractor } from '../../application/use-cases/category/update-category.interactor.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import { isLeft } from '@/infra/lib/box.js';
import { AttributeId, CategoryId, FileId, TypeId } from '@/kernel/domain/ids.js';
import type { AttributeSchema } from '@/kernel/domain/vo/attribute.js';

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
  public async list() {
    const result = await this.getCategoryList.execute();
    if (isLeft(result)) throw domainToHttpError(result.error.toResponse());
    return result.value;
  }

  @Get(':id')
  public async getById(@Param('id') id: string) {
    const result = await this.getCategoryDetail.execute({ id: CategoryId.raw(id) });
    if (isLeft(result)) throw domainToHttpError(result.error.toResponse());
    return result.value;
  }

  @Post()
  public async create(
    @Body()
    body: {
      id: string;
      parentCategoryId: string | null;
      name: string;
      iconId: string | null;
      allowedTypeIds: string[];
    },
  ) {
    const result = await this.createCategory.execute({
      id: CategoryId.raw(body.id),
      parentCategoryId: body.parentCategoryId ? CategoryId.raw(body.parentCategoryId) : null,
      name: body.name,
      iconId: body.iconId ? FileId.raw(body.iconId) : null,
      allowedTypeIds: body.allowedTypeIds.map((typeId) => TypeId.raw(typeId)),
    });

    if (isLeft(result)) throw domainToHttpError(result.error.toResponse());
    return result.value;
  }

  @Patch(':id')
  public async update(
    @Param('id') id: string,
    @Body()
    body: {
      name: string;
      iconId: string | null;
      parentCategoryId: string | null;
      allowedTypeIds: string[];
    },
  ) {
    const result = await this.updateCategory.execute({
      id: CategoryId.raw(id),
      name: body.name,
      iconId: body.iconId ? FileId.raw(body.iconId) : null,
      parentCategoryId: body.parentCategoryId ? CategoryId.raw(body.parentCategoryId) : null,
      allowedTypeIds: body.allowedTypeIds.map((typeId) => TypeId.raw(typeId)),
    });

    if (isLeft(result)) throw domainToHttpError(result.error.toResponse());
    return result.value;
  }

  @Post(':id/publish')
  @HttpCode(200)
  public async publish(@Param('id') id: string) {
    const result = await this.publishCategory.execute({ id: CategoryId.raw(id) });
    if (isLeft(result)) throw domainToHttpError(result.error.toResponse());
    return {};
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  public async unpublish(@Param('id') id: string) {
    const result = await this.unpublishCategory.execute({ id: CategoryId.raw(id) });
    if (isLeft(result)) throw domainToHttpError(result.error.toResponse());
    return {};
  }

  @Post(':id/attributes')
  @HttpCode(200)
  public async assignAttribute(
    @Param('id') id: string,
    @Body()
    body: {
      attributeId: string;
      name: string;
      required: boolean;
      schema: AttributeSchema;
    },
  ) {
    const result = await this.addAttribute.execute({
      categoryId: CategoryId.raw(id),
      attributeId: AttributeId.raw(body.attributeId),
      name: body.name,
      required: body.required,
      schema: body.schema,
    });

    if (isLeft(result)) throw domainToHttpError(result.error.toResponse());
    return {};
  }

  @Delete(':id/attributes/:attributeId')
  @HttpCode(200)
  public async unassignAttribute(
    @Param('id') id: string,
    @Param('attributeId') attributeId: string,
  ) {
    const result = await this.removeAttribute.execute({
      categoryId: CategoryId.raw(id),
      attributeId: AttributeId.raw(attributeId),
    });

    if (isLeft(result)) throw domainToHttpError(result.error.toResponse());
    return {};
  }
}
