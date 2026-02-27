import { describe, expect, it } from 'vitest';

import { CreateEvent, createEventId } from './event.js';

describe('CreateEvent', () => {
  describe('event without data', () => {
    const TestEvent = CreateEvent('test_event');

    it('should build event with correct name', () => {
      const event = TestEvent.build({
        id: createEventId(),
        now: new Date('2024-01-01'),
      });

      expect(event.name).toBe('test_event');
    });

    it('should store occuredAt as ISO string', () => {
      const now = new Date('2024-01-01T10:00:00Z');
      const event = TestEvent.build({ id: createEventId(), now });

      expect(event.occuredAt).toBe('2024-01-01T10:00:00.000Z');
    });

    it('should store provided id', () => {
      const id = createEventId();
      const event = TestEvent.build({ id, now: new Date() });

      expect(event.id).toBe(id);
    });

    it('should have undefined data', () => {
      const event = TestEvent.build({ id: createEventId(), now: new Date() });

      expect(event.data).toBeUndefined();
    });
  });

  describe('event with payload (withPayload)', () => {
    const UserCreatedEvent = CreateEvent('user.created').withPayload<{
      name: string;
      email: string;
    }>();

    it('should build event with data', () => {
      const data = { name: 'John Doe', email: 'john@example.com' };
      const event = UserCreatedEvent.build({
        id: createEventId(),
        now: new Date('2024-01-01'),
        data,
      });

      expect(event.data).toEqual(data);
    });

    it('should preserve name after withPayload', () => {
      const event = UserCreatedEvent.build({
        id: createEventId(),
        now: new Date('2024-01-01'),
        data: { name: 'Jane', email: 'jane@example.com' },
      });

      expect(event.name).toBe('user.created');
    });
  });
});

describe('createEventId', () => {
  it('should return a non-empty string', () => {
    const id = createEventId();

    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should generate unique ids', () => {
    const id1 = createEventId();
    const id2 = createEventId();

    expect(id1).not.toBe(id2);
  });
});
