import { Module } from '@nestjs/common';

import { DrizzleDiscoveryQuery } from './adapters/db/queries/discovery.query.js';
import { DrizzleAttributeRepository } from './adapters/db/repositories/attribute.repository.js';
import { DrizzleServiceListingRepository } from './adapters/db/repositories/service-listing.repository.js';
import { OnAttributeEventHandler } from './application/handlers/on-attribute-event.handler.js';
import { OnServiceEventHandler } from './application/handlers/on-service-event.handler.js';
import {
  AttributeRepository,
  ServiceDetailQueryPort,
  ServiceFeedQueryPort,
  ServiceListingRepository,
  ServiceSearchQueryPort,
} from './application/ports.js';
import { GetFeedInteractor } from './application/queries/feed/get-feed.interactor.js';
import { SearchServicesInteractor } from './application/queries/search/search-services.interactor.js';
import { GetServiceDetailInteractor } from './application/queries/service-detail/get-service-detail.interactor.js';

@Module({
  providers: [
    { provide: ServiceListingRepository, useClass: DrizzleServiceListingRepository },
    { provide: AttributeRepository, useClass: DrizzleAttributeRepository },
    { provide: ServiceFeedQueryPort, useClass: DrizzleDiscoveryQuery },
    { provide: ServiceSearchQueryPort, useClass: DrizzleDiscoveryQuery },
    { provide: ServiceDetailQueryPort, useClass: DrizzleDiscoveryQuery },
    OnServiceEventHandler,
    OnAttributeEventHandler,
    GetFeedInteractor,
    SearchServicesInteractor,
    GetServiceDetailInteractor,
  ],
  exports: [OnServiceEventHandler, OnAttributeEventHandler],
})
export class DiscoveryModule {}
