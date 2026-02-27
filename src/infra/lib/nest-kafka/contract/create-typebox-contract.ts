import type { StaticDecode, TSchema } from 'typebox';
import { Value } from 'typebox/value';

import type { Contract, Serializer } from './contract.js';

export type TypeboxContractOptions<Topic, T extends TSchema> = {
  topic: Topic;
  schema: T;
};

class TypeboxSerializer<T extends TSchema> implements Serializer<StaticDecode<T>> {
  public constructor(private readonly schema: T) {}

  public serialize(value: StaticDecode<T>): Buffer {
    return Buffer.from(JSON.stringify(value));
  }

  public deserialize(buffer: Buffer): StaticDecode<T> {
    const parsed: unknown = JSON.parse(buffer.toString());
    return Value.Decode(this.schema, parsed);
  }
}

export function createTypeboxContract<const Topic, const T extends TSchema>(
  options: TypeboxContractOptions<Topic, T>,
): Contract<Topic, StaticDecode<T>, 'json'> {
  return {
    topic: options.topic,
    transport: 'json',
    serializer: new TypeboxSerializer(options.schema),
  };
}
