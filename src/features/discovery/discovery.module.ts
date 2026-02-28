import { Module } from '@nestjs/common';

import { ServiceListingRepository, AttributeRepository } from './application/ports.js';
import { ServiceFeedQueryPort, ServiceSearchQueryPort, ServiceDetailQueryPort } from './application/ports.js';
import { OnServiceEventHandler } from './application/handlers/on-service-event.handler.js';
import { OnAttributeEventHandler } from './application/handlers/on-attribute-event.handler.js';
import { GetFeedInteractor } from './application/queries/feed/get-feed.interactor.js';
import { SearchServicesInteractor } from './application/queries/search/search-services.interactor.js';
import { GetServiceDetailInteractor } from './application/queries/service-detail/get-service-detail.interactor.js';
import { DrizzleServiceListingRepository } from './adapters/db/service-listing.repository.js';
import { DrizzleAttributeRepository } from './adapters/db/attribute.repository.js';
import { DrizzleDiscoveryQuery } from './adapters/db/discovery.query.js';

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
