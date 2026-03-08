import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';

import { CreateItemTypeInteractor } from '../../application/use-cases/item-type/create-item-type.interactor.js';
import { GetItemTypeListInteractor } from '../../application/use-cases/item-type/get-item-type-list.interactor.js';
import { UpdateItemTypeInteractor } from '../../application/use-cases/item-type/update-item-type.interactor.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import { isLeft } from '@/infra/lib/box.js';
import { TypeId } from '@/kernel/domain/ids.js';
import type { WidgetType } from '@/kernel/domain/vo/widget.js';

@Controller('cms/item-types')
export class ItemTypesController {
  public constructor(
    private readonly createItemType: CreateItemTypeInteractor,
    private readonly updateItemType: UpdateItemTypeInteractor,
    private readonly getItemTypeList: GetItemTypeListInteractor,
  ) {}

  @Get()
  public async list() {
    const result = await this.getItemTypeList.execute();
    if (isLeft(result)) throw domainToHttpError(result.error.toResponse());
    return result.value;
  }

  @Post()
  public async create(
    @Body()
    body: {
      id: string;
      name: string;
      availableWidgetTypes: WidgetType[];
      requiredWidgetTypes: WidgetType[];
    },
  ) {
    const result = await this.createItemType.execute({
      id: TypeId.raw(body.id),
      name: body.name,
      availableWidgetTypes: body.availableWidgetTypes,
      requiredWidgetTypes: body.requiredWidgetTypes,
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
      availableWidgetTypes: WidgetType[];
      requiredWidgetTypes: WidgetType[];
    },
  ) {
    const result = await this.updateItemType.execute({
      id: TypeId.raw(id),
      name: body.name,
      availableWidgetTypes: body.availableWidgetTypes,
      requiredWidgetTypes: body.requiredWidgetTypes,
    });

    if (isLeft(result)) throw domainToHttpError(result.error.toResponse());
    return result.value;
  }
}
