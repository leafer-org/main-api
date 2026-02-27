/** biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: Test describe */
import { describe, expect, it } from 'vitest';

import { createProtoContract, type ProtoMessage } from './create-proto-contract.js';

describe('createProtoContract', () => {
  type TestMessage = {
    id: string;
    value: number;
  };

  const mockProto: ProtoMessage<TestMessage> = {
    encode(message: TestMessage) {
      const json = JSON.stringify(message);
      const data = new TextEncoder().encode(json);
      return { finish: () => data };
    },
    decode(input: Uint8Array) {
      const json = new TextDecoder().decode(input);
      return JSON.parse(json) as TestMessage;
    },
  };

  const contract = createProtoContract({
    topic: 'proto.topic',
    proto: mockProto,
  });

  it('should create contract with correct topic', () => {
    expect(contract.topic).toBe('proto.topic');
  });

  it('should create contract with protobuf transport', () => {
    expect(contract.transport).toBe('protobuf');
  });

  it('should serialize message to buffer', () => {
    const message: TestMessage = { id: 'abc', value: 42 };

    const buffer = contract.serializer.serialize(message);

    expect(buffer).toBeInstanceOf(Buffer);
  });

  it('should deserialize buffer to message', () => {
    const message: TestMessage = { id: 'xyz', value: 10 };
    const buffer = contract.serializer.serialize(message);

    const result = contract.serializer.deserialize(buffer);

    expect(result).toEqual(message);
  });

  it('should roundtrip serialize/deserialize', () => {
    const original: TestMessage = { id: 'test-123', value: 999 };

    const buffer = contract.serializer.serialize(original);
    const result = contract.serializer.deserialize(buffer);

    expect(result).toEqual(original);
  });

  it('should work with complex proto message', () => {
    type ComplexMessage = {
      orderId: string;
      items: Array<{ productId: string; quantity: number }>;
      metadata: { createdAt: string };
    };

    const complexProto: ProtoMessage<ComplexMessage> = {
      encode(msg: ComplexMessage) {
        const json = JSON.stringify(msg);
        const data = new TextEncoder().encode(json);
        return { finish: () => data };
      },
      decode(input: Uint8Array) {
        const json = new TextDecoder().decode(input);
        return JSON.parse(json) as ComplexMessage;
      },
    };

    const complexContract = createProtoContract({
      topic: 'complex.topic',
      proto: complexProto,
    });

    const message: ComplexMessage = {
      orderId: 'order-1',
      items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 5 },
      ],
      metadata: { createdAt: '2024-01-01' },
    };

    const buffer = complexContract.serializer.serialize(message);
    const result = complexContract.serializer.deserialize(buffer);

    expect(result).toEqual(message);
  });
});
