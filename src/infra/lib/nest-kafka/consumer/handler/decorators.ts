import type { Contract } from '../../contract/contract.js';
import type { ConsumerId } from '../consumer-id.js';
import type { ContractKafkaMessage } from './kafka-handler.interface.js';

export const KAFKA_CONSUMER_ID = Symbol('KAFKA_CONSUMER_ID');
export const KAFKA_CONTRACT_HANDLERS = Symbol('KAFKA_CONTRACT_HANDLERS');

export type ContractHandlerMetadata = {
  methodKey: string;
  contracts: Contract[];
  batch: boolean;
};

export function KafkaConsumerHandlers(consumerId: ConsumerId): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(KAFKA_CONSUMER_ID, consumerId, target);
  };
}

export function ContractHandler<C extends Contract>(contract: C | C[]) {
  return (
    _target: object,
    propertyKey: string | symbol,
    _descriptor: TypedPropertyDescriptor<(message: ContractKafkaMessage<C>) => Promise<void>>,
  ) => {
    const existing: ContractHandlerMetadata[] =
      Reflect.getMetadata(KAFKA_CONTRACT_HANDLERS, _target.constructor) ?? [];

    existing.push({
      methodKey: String(propertyKey),
      contracts: Array.isArray(contract) ? contract : [contract],
      batch: false,
    });

    Reflect.defineMetadata(KAFKA_CONTRACT_HANDLERS, existing, _target.constructor);
  };
}

export function BatchContractHandler<C extends Contract>(contract: C | C[]) {
  return (
    _target: object,
    propertyKey: string | symbol,
    _descriptor: TypedPropertyDescriptor<(messages: ContractKafkaMessage<C>[]) => Promise<void>>,
  ) => {
    const existing: ContractHandlerMetadata[] =
      Reflect.getMetadata(KAFKA_CONTRACT_HANDLERS, _target.constructor) ?? [];

    existing.push({
      methodKey: String(propertyKey),
      contracts: Array.isArray(contract) ? contract : [contract],
      batch: true,
    });

    Reflect.defineMetadata(KAFKA_CONTRACT_HANDLERS, existing, _target.constructor);
  };
}
