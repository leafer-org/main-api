import { Injectable } from '@nestjs/common';

import type { BatchMessage, Contract, ContractMessage, SendOptions } from '../nest-kafka/index.js';
import { outboxTable } from './outbox.schema.js';

// biome-ignore lint/suspicious/noExplicitAny: accept any Drizzle tx/db structurally
type DrizzleTx = { insert: (table: any) => { values: (data: any) => any } };

export type OutboxSendOptions = Pick<SendOptions, 'key' | 'headers'>;

@Injectable()
export class OutboxService {
  public enqueue<C extends Contract>(
    tx: DrizzleTx,
    contract: C,
    message: ContractMessage<C>,
    options?: OutboxSendOptions,
  ) {
    const payload = contract.serializer.serialize(message);
    return tx.insert(outboxTable).values({
      topic: contract.topic,
      key: options?.key ?? null,
      payload,
      headers: options?.headers ?? null,
    });
  }

  public enqueueBatch<C extends Contract>(tx: DrizzleTx, contract: C, messages: BatchMessage<C>[]) {
    const values = messages.map((msg) => ({
      topic: contract.topic,
      key: msg.key ?? null,
      payload: contract.serializer.serialize(msg.value),
      headers: msg.headers ?? null,
    }));
    return tx.insert(outboxTable).values(values);
  }
}
