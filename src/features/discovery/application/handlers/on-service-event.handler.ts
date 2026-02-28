import { Inject, Injectable } from '@nestjs/common';

import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ServiceIntegrationEvent } from '@/kernel/domain/events/service.events.js';
import { serviceListingProject } from '../../domain/read-models/service-listing/service-listing.projection.js';
import { ServiceListingRepository } from '../ports.js';

@Injectable()
export class OnServiceEventHandler {
  public constructor(
    @Inject(ServiceListingRepository) private readonly repo: ServiceListingRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
  ) {}

  public async handle(event: ServiceIntegrationEvent): Promise<void> {
    return this.txHost.startTransaction(async (tx) => {
      const existing = await this.repo.findByServiceId(tx, event.serviceId);
      const result = serviceListingProject(existing, event);

      if (result) {
        await this.repo.save(tx, result);
      } else {
        await this.repo.deleteByServiceId(tx, event.serviceId);
      }
    });
  }
}
