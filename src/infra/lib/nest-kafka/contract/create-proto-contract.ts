import type { Contract, Serializer } from './contract.js';

export type ProtoMessage<T> = {
  encode(message: T): { finish(): Uint8Array };
  decode(input: Uint8Array): T;
};

export type ProtoContractOptions<Topic, D> = {
  topic: Topic;
  proto: ProtoMessage<D>;
};

class ProtoSerializer<T> implements Serializer<T> {
  public constructor(private readonly proto: ProtoMessage<T>) {}

  public serialize(value: T): Buffer {
    return Buffer.from(this.proto.encode(value).finish());
  }

  public deserialize(buffer: Buffer): T {
    return this.proto.decode(buffer);
  }
}

export function createProtoContract<Topic, T>(
  options: ProtoContractOptions<Topic, T>,
): Contract<Topic, T, 'protobuf'> {
  return {
    topic: options.topic,
    transport: 'protobuf',
    serializer: new ProtoSerializer(options.proto),
  };
}
