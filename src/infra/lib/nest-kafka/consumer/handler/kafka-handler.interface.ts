import type { Contract, ContractMessage, ContractTopic } from '../../contract/contract.js';

export type KafkaMessage<Topic, T> = {
  value: T;
  topic: Topic;
  partition: number;
  offset: number;
  key: string | undefined;
  timestamp: number;
  headers: Record<string, string>;
};

export type ContractKafkaMessage<T extends Contract> = T extends unknown
  ? KafkaMessage<ContractTopic<T>, ContractMessage<T>>
  : never;

export type BatchOptions = {
  size: number;
};

export interface KafkaMessageHandler<C extends Contract = Contract> {
  handleMessage: (message: ContractKafkaMessage<C>) => Promise<void>;
}

export interface KafkaBatchHandler<C extends Contract = Contract> {
  handleBatch: (messages: ContractKafkaMessage<C>[]) => Promise<void>;
}
