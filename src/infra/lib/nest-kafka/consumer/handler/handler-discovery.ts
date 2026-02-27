import { Injectable, type Type } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';

import type { Contract } from '../../contract/contract.js';
import type { ConsumerId } from '../consumer-id.js';
import {
  type ContractHandlerMetadata,
  KAFKA_CONSUMER_ID,
  KAFKA_CONTRACT_HANDLERS,
} from './decorators.js';

export type DiscoveredHandler = {
  contracts: Contract[];
  instance: object;
  methodKey: string;
  batch: boolean;
  isRequestScoped: boolean;
  metatype: Type;
};

@Injectable()
export class HandlerDiscovery {
  public constructor(private readonly discoveryService: DiscoveryService) {}

  public getHandlers(consumerId: ConsumerId): DiscoveredHandler[] {
    const providers = this.discoveryService.getProviders();
    const handlers: DiscoveredHandler[] = [];

    for (const wrapper of providers) {
      const { instance } = wrapper;
      if (!instance || !instance.constructor) {
        continue;
      }

      const registeredConsumerId: ConsumerId | undefined = Reflect.getMetadata(
        KAFKA_CONSUMER_ID,
        instance.constructor,
      );

      if (registeredConsumerId !== consumerId) {
        continue;
      }

      const methodHandlers: ContractHandlerMetadata[] =
        Reflect.getMetadata(KAFKA_CONTRACT_HANDLERS, instance.constructor) ?? [];

      const isRequestScoped = !wrapper.isDependencyTreeStatic();

      for (const handler of methodHandlers) {
        handlers.push({
          contracts: handler.contracts,
          instance,
          methodKey: handler.methodKey,
          batch: handler.batch,
          isRequestScoped,
          metatype: instance.constructor as Type,
        });
      }
    }

    return handlers;
  }
}
