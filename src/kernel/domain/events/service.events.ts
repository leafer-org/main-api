import type { ServiceId } from '../ids.js';
import type { ServiceComponent } from '../service-component.js';

export type ServicePublishedEvent = {
  type: 'service.published';
  serviceId: ServiceId;
  components: ServiceComponent[];
  publishedAt: Date;
};

export type ServiceUpdatedEvent = {
  type: 'service.updated';
  serviceId: ServiceId;
  components: ServiceComponent[];
  updatedAt: Date;
};

export type ServiceUnpublishedEvent = {
  type: 'service.unpublished';
  serviceId: ServiceId;
  unpublishedAt: Date;
};

export type ServiceIntegrationEvent =
  | ServicePublishedEvent
  | ServiceUpdatedEvent
  | ServiceUnpublishedEvent;
