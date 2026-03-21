import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import { CreateItemTypeInteractor } from '../../application/use-cases/item-type/create-item-type.interactor.js';
import { GetItemTypeListInteractor } from '../../application/use-cases/item-type/get-item-type-list.interactor.js';
import { UpdateItemTypeInteractor } from '../../application/use-cases/item-type/update-item-type.interactor.js';
import type { ItemTypeEntity } from '../../domain/aggregates/item-type/entity.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse, PublicSchemas } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { TypeId } from '@/kernel/domain/ids.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';

function toWidgetSettings(raw: PublicBody['createCmsItemType']['widgetSettings']): WidgetSettings[] {
  return raw as WidgetSettings[];
}

function toItemTypeDetailDto(state: Readonly<ItemTypeEntity>): PublicSchemas['ItemTypeDetail'] {
  return {
    id: state.id,
    name: state.name,
    widgetSettings: state.widgetSettings,
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
  };
}

@Controller('cms/item-types')
export class ItemTypesController {
  public constructor(
    private readonly createItemType: CreateItemTypeInteractor,
    private readonly updateItemType: UpdateItemTypeInteractor,
    private readonly getItemTypeList: GetItemTypeListInteractor,
  ) {}

  @Get()
  public async list(): Promise<PublicResponse['getCmsItemTypes']> {
    const result = await this.getItemTypeList.execute();
    if (isLeft(result)) throw domainToHttpError<'getCmsItemTypes'>(result.error.toResponse());
    return result.value;
  }

  @Post()
  public async create(
    @Body() body: PublicBody['createCmsItemType'],
  ): Promise<PublicResponse['createCmsItemType']> {
    const result = await this.createItemType.execute({
      id: TypeId.raw(body.id),
      name: body.name,
      widgetSettings: toWidgetSettings(body.widgetSettings),
    });

    if (isLeft(result)) throw domainToHttpError<'createCmsItemType'>(result.error.toResponse());
    return toItemTypeDetailDto(result.value);
  }

  @Patch(':id')
  public async update(
    @Param('id') id: string,
    @Body() body: PublicBody['updateCmsItemType'],
  ): Promise<PublicResponse['updateCmsItemType']> {
    const result = await this.updateItemType.execute({
      id: TypeId.raw(id),
      name: body.name,
      widgetSettings: toWidgetSettings(body.widgetSettings),
    });

    if (isLeft(result)) throw domainToHttpError<'updateCmsItemType'>(result.error.toResponse());
    return toItemTypeDetailDto(result.value);
  }
}
