import { describe, expect, it } from 'vitest';

import type { EntityId } from './entity.js';
import { Entity } from './entity.js';

type TestUserId = EntityId<'TestUser'>;

type TestUserData = {
  id: TestUserId;
  name: string;
  age: number;
};

const TEST_USER_AGE = 30;
const TEST_USER_NEW_AGE = 25;

class TestUser extends Entity<TestUserData> {
  public static create(id: TestUserId, name: string, age: number): TestUser {
    return new TestUser({ id, name, age });
  }

  public get name(): string {
    return this.state.name;
  }

  public withName(name: string): TestUser {
    return new TestUser({ ...this.state, name });
  }
}

describe('Entity', () => {
  const userId = 'user-123' as TestUserId;

  describe('id', () => {
    it('should return entity id', () => {
      const user = TestUser.create(userId, 'John', TEST_USER_AGE);

      expect(user.id).toBe(userId);
    });
  });

  describe('toJson', () => {
    it('should return readonly data', () => {
      const user = TestUser.create(userId, 'John', TEST_USER_AGE);

      expect(user.toJson()).toEqual({
        id: userId,
        name: 'John',
        age: TEST_USER_AGE,
      });
    });

    it('should return same reference on multiple calls', () => {
      const user = TestUser.create(userId, 'John', TEST_USER_AGE);

      expect(user.toJson()).toBe(user.toJson());
    });
  });

  describe('immutability', () => {
    it('should create new instance on mutation', () => {
      const user1 = TestUser.create(userId, 'John', TEST_USER_AGE);
      const user2 = user1.withName('Jane');

      expect(user1.name).toBe('John');
      expect(user2.name).toBe('Jane');
      expect(user1).not.toBe(user2);
    });
  });

  describe('equals', () => {
    it('should return true for entities with same id', () => {
      const user1 = TestUser.create(userId, 'John', TEST_USER_AGE);
      const user2 = TestUser.create(userId, 'Jane', TEST_USER_NEW_AGE);

      expect(Entity.equals(user1, user2)).toBe(true);
    });

    it('should return false for entities with different id', () => {
      const user1 = TestUser.create('user-1' as TestUserId, 'John', TEST_USER_AGE);
      const user2 = TestUser.create('user-2' as TestUserId, 'John', TEST_USER_AGE);

      expect(Entity.equals(user1, user2)).toBe(false);
    });
  });
});
