import type { Type } from '@nestjs/common';
import { ContextIdFactory, type ModuleRef } from '@nestjs/core';

import { KafkaConnectionError } from '../../errors/kafka.errors.js';
import type { KafkaMessage } from './kafka-handler.interface.js';

export type MessageInvoker = (message: KafkaMessage<string, unknown>) => Promise<void>;
export type BatchInvoker = (messages: KafkaMessage<string, unknown>[]) => Promise<void>;

function getMethod<T extends (...args: never[]) => unknown>(target: object, methodKey: string): T {
  const method = (target as Record<string, T>)[methodKey];
  if (!method) {
    throw new KafkaConnectionError(
      `Method ${methodKey} not found on ${target.constructor.name}`,
      new Error('Method not found'),
    );
  }
  return method;
}

export class HandlerInvoker {
  public constructor(private readonly moduleRef: ModuleRef) {}

  public createMessageInvoker(
    instance: object,
    methodKey: string,
    isRequestScoped: boolean,
    metatype: Type,
  ): MessageInvoker {
    if (!isRequestScoped) {
      const bound = getMethod<MessageInvoker>(instance, methodKey).bind(instance);
      return bound;
    }

    return async (message) => {
      const contextId = ContextIdFactory.create();
      const resolved = await this.moduleRef.resolve(metatype, contextId, { strict: false });
      return getMethod<MessageInvoker>(resolved, methodKey).call(resolved, message);
    };
  }

  public createBatchInvoker(
    instance: object,
    methodKey: string,
    isRequestScoped: boolean,
    metatype: Type,
  ): BatchInvoker {
    if (!isRequestScoped) {
      const bound = getMethod<BatchInvoker>(instance, methodKey).bind(instance);
      return bound;
    }

    return async (messages) => {
      const contextId = ContextIdFactory.create();
      const resolved = await this.moduleRef.resolve(metatype, contextId, { strict: false });
      return getMethod<BatchInvoker>(resolved, methodKey).call(resolved, messages);
    };
  }
}
