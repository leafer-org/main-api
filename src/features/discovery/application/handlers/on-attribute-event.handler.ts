import { Inject, Injectable } from '@nestjs/common';

import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { AttributeIntegrationEvent } from '@/kernel/domain/events/attribute.events.js';
import { attributeProject } from '../../domain/read-models/attribute.projection.js';
import { AttributeRepository } from '../ports.js';

@Injectable()
export class OnAttributeEventHandler {
  public constructor(
    @Inject(AttributeRepository) private readonly repo: AttributeRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
  ) {}

  public async handle(event: AttributeIntegrationEvent): Promise<void> {
    return this.txHost.startTransaction(async (tx) => {
      const existing = await this.repo.findByAttributeId(tx, event.attributeId);
      const result = attributeProject(existing, event);

      if (result) {
        await this.repo.save(tx, result);
      } else {
        await this.repo.deleteByAttributeId(tx, event.attributeId);
      }
    });
  }
}
