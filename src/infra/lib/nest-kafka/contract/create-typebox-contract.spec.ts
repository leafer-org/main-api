import { Type } from 'typebox';
import { describe, expect, it } from 'vitest';

import { createTypeboxContract } from './create-typebox-contract.js';

describe('createTypeboxContract', () => {
  const schema = Type.Object({
    id: Type.String(),
    count: Type.Number(),
  });

  const contract = createTypeboxContract({
    topic: 'test.topic',
    schema,
  });

  it('should create contract with correct topic', () => {
    expect(contract.topic).toBe('test.topic');
  });

  it('should create contract with json transport', () => {
    expect(contract.transport).toBe('json');
  });

  it('should serialize message to JSON buffer', () => {
    const message = { id: 'abc', count: 42 };

    const buffer = contract.serializer.serialize(message);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.toString()).toBe('{"id":"abc","count":42}');
  });

  it('should deserialize buffer to message', () => {
    const buffer = Buffer.from('{"id":"xyz","count":10}');

    const message = contract.serializer.deserialize(buffer);

    expect(message).toEqual({ id: 'xyz', count: 10 });
  });

  it('should roundtrip serialize/deserialize', () => {
    const original = { id: 'test-123', count: 999 };

    const buffer = contract.serializer.serialize(original);
    const result = contract.serializer.deserialize(buffer);

    expect(result).toEqual(original);
  });

  it('should validate schema on deserialize', () => {
    const invalidBuffer = Buffer.from('{"id":123,"count":"invalid"}');

    expect(() => contract.serializer.deserialize(invalidBuffer)).toThrow();
  });

  it('should handle nested objects', () => {
    const nestedSchema = Type.Object({
      user: Type.Object({
        name: Type.String(),
        age: Type.Number(),
      }),
      tags: Type.Array(Type.String()),
    });

    const nestedContract = createTypeboxContract({
      topic: 'nested.topic',
      schema: nestedSchema,
    });

    const message = {
      user: { name: 'John', age: 30 },
      tags: ['admin', 'active'],
    };

    const buffer = nestedContract.serializer.serialize(message);
    const result = nestedContract.serializer.deserialize(buffer);

    expect(result).toEqual(message);
  });
});
