import type { ServiceIntegrationEvent } from '@/kernel/domain/events/service.events.js';
import { assertNever } from '@/infra/ddd/utils.js';
import type { ServiceListingReadModel } from './service-listing.read-model.js';

export function serviceListingProject(
  state: ServiceListingReadModel | null,
  event: ServiceIntegrationEvent,
): ServiceListingReadModel | null {
  switch (event.type) {
    case 'service.published': {
      return {
        serviceId: event.serviceId,
        components: event.components,
        publishedAt: event.publishedAt,
        updatedAt: event.publishedAt,
      };
    }

    case 'service.updated': {
      if (!state) throw new Error('State is required for service.updated');

      return {
        ...state,
        components: event.components,
        updatedAt: event.updatedAt,
      };
    }

    case 'service.unpublished': {
      return null;
    }

    default:
      assertNever(event);
  }
}
