import { Global, Module } from '@nestjs/common';

import { DrizzleCatalogValidationAdapter } from './adapters/db/catalog-validation.adapter.js';
import { DrizzleCityCoordinatesAdapter } from './adapters/db/city-coordinates.adapter.js';
import { DrizzleCategoryQuery } from './adapters/db/queries/category.query.js';
import { DrizzleCityQuery } from './adapters/db/queries/city.query.js';
import { DrizzleItemTypeQuery } from './adapters/db/queries/item-type.query.js';
import { DrizzleCategoryRepository } from './adapters/db/repositories/category.repository.js';
import { OutboxCategoryEventPublisher } from './adapters/db/repositories/category-event-publisher.js';
import { DrizzleItemTypeRepository } from './adapters/db/repositories/item-type.repository.js';
import { OutboxItemTypeEventPublisher } from './adapters/db/repositories/item-type-event-publisher.js';
import { CategoriesController } from './adapters/http/categories.controller.js';
import { CitiesController } from './adapters/http/cities.controller.js';
import { ItemTypesController } from './adapters/http/item-types.controller.js';
import { CategoryCascadeKafkaHandler } from './adapters/kafka/category-cascade.handler.js';
import {
  CategoryEventPublisher,
  CategoryQueryPort,
  CategoryRepository,
  CityQueryPort,
  ItemTypeEventPublisher,
  ItemTypeQueryPort,
  ItemTypeRepository,
} from './application/ports.js';
import { AddAttributeInteractor } from './application/use-cases/category/add-attribute.interactor.js';
import { CreateCategoryInteractor } from './application/use-cases/category/create-category.interactor.js';
import { GetCategoryDetailInteractor } from './application/use-cases/category/get-category-detail.interactor.js';
import { GetCategoryListInteractor } from './application/use-cases/category/get-category-list.interactor.js';
import { PublishCategoryInteractor } from './application/use-cases/category/publish-category.interactor.js';
import { RemoveAttributeInteractor } from './application/use-cases/category/remove-attribute.interactor.js';
import { RepublishChildrenHandler } from './application/use-cases/category/republish-children.handler.js';
import { UnpublishCategoryInteractor } from './application/use-cases/category/unpublish-category.interactor.js';
import { UnpublishChildrenHandler } from './application/use-cases/category/unpublish-children.handler.js';
import { UpdateCategoryInteractor } from './application/use-cases/category/update-category.interactor.js';
import { CreateItemTypeInteractor } from './application/use-cases/item-type/create-item-type.interactor.js';
import { GetCitiesInteractor } from './application/use-cases/cities/get-cities.interactor.js';
import { GetItemTypeListInteractor } from './application/use-cases/item-type/get-item-type-list.interactor.js';
import { UpdateItemTypeInteractor } from './application/use-cases/item-type/update-item-type.interactor.js';
import { Clock, SystemClock } from '@/infra/lib/clock.js';
import { CatalogValidationPort } from '@/kernel/application/ports/catalog-validation.js';
import { CityCoordinatesPort } from '@/kernel/application/ports/city-coordinates.js';

@Global()
@Module({
  controllers: [CategoriesController, CitiesController, ItemTypesController],
  providers: [
    // Infrastructure
    { provide: Clock, useClass: SystemClock },

    // Port → Adapter bindings
    { provide: CategoryRepository, useClass: DrizzleCategoryRepository },
    { provide: ItemTypeRepository, useClass: DrizzleItemTypeRepository },
    { provide: CategoryEventPublisher, useClass: OutboxCategoryEventPublisher },
    { provide: ItemTypeEventPublisher, useClass: OutboxItemTypeEventPublisher },
    { provide: CategoryQueryPort, useClass: DrizzleCategoryQuery },
    { provide: ItemTypeQueryPort, useClass: DrizzleItemTypeQuery },
    { provide: CityQueryPort, useClass: DrizzleCityQuery },
    { provide: CatalogValidationPort, useClass: DrizzleCatalogValidationAdapter },
    { provide: CityCoordinatesPort, useClass: DrizzleCityCoordinatesAdapter },

    // Category use cases
    CreateCategoryInteractor,
    UpdateCategoryInteractor,
    PublishCategoryInteractor,
    UnpublishCategoryInteractor,
    AddAttributeInteractor,
    RemoveAttributeInteractor,
    GetCategoryListInteractor,
    GetCategoryDetailInteractor,

    // City use cases
    GetCitiesInteractor,

    // ItemType use cases
    CreateItemTypeInteractor,
    UpdateItemTypeInteractor,
    GetItemTypeListInteractor,

    // Cascade handlers
    RepublishChildrenHandler,
    UnpublishChildrenHandler,

    // Kafka handlers
    CategoryCascadeKafkaHandler,
  ],
  exports: [CatalogValidationPort, CityCoordinatesPort],
})
export class CmsModule {}
