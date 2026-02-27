export type Transport = 'json' | 'protobuf';

export type Serializer<T> = {
  serialize: (value: T) => Buffer;
  deserialize: (buffer: Buffer) => T;
};

// biome-ignore lint/suspicious/noExplicitAny: covariance
export type Contract<Topic = string, T = any, TTransport extends Transport = Transport> = {
  readonly topic: Topic;
  readonly transport: TTransport;
  readonly serializer: Serializer<T>;
  readonly _type?: T;
};

export type ContractMessage<C> = C extends Contract<string, infer T, Transport> ? T : never;
export type ContractTopic<C> = C extends Contract<infer T> ? T : never;

export type ContractTransport<C> =
  C extends Contract<unknown, infer TTransport> ? TTransport : never;
