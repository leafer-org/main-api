import type { ServiceId } from '@/kernel/domain/ids.js';
import type { ServiceComponent } from '@/kernel/domain/vo/service-component.js';

export type ServiceListingReadModel = {
  serviceId: ServiceId;
  components: ServiceComponent[];
  publishedAt: Date;
  updatedAt: Date;
};
