import { describe, expect, it } from 'vitest';

import { FullName, InvalidFullNameError } from './full-name.js';
import { Left, Right } from '@/infra/lib/box.js';

describe('FullName', () => {
  describe('create', () => {
    it('should accept a simple full name', () => {
      expect(FullName.create('Иван Иванов')).toEqual(Right(FullName.raw('Иван Иванов')));
    });

    it('should accept latin name', () => {
      expect(FullName.create('John Doe')).toEqual(Right(FullName.raw('John Doe')));
    });

    it('should accept name with hyphen', () => {
      expect(FullName.create('Мария-Иванова Петрова')).toEqual(
        Right(FullName.raw('Мария-Иванова Петрова')),
      );
    });

    it('should accept name with apostrophe', () => {
      expect(FullName.create("O'Brien")).toEqual(Right(FullName.raw("O'Brien")));
    });

    it('should normalize extra whitespace', () => {
      expect(FullName.create('  Иван   Иванов  ')).toEqual(Right(FullName.raw('Иван Иванов')));
    });

    it('should accept single name (min 2 chars)', () => {
      expect(FullName.create('Аб')).toEqual(Right(FullName.raw('Аб')));
    });

    it('should reject empty string', () => {
      expect(FullName.create('')).toEqual(Left(new InvalidFullNameError()));
    });

    it('should reject whitespace-only string', () => {
      expect(FullName.create('   ')).toEqual(Left(new InvalidFullNameError()));
    });

    it('should reject single character', () => {
      expect(FullName.create('А')).toEqual(Left(new InvalidFullNameError()));
    });

    it('should reject name exceeding max length', () => {
      expect(FullName.create('А'.repeat(101))).toEqual(Left(new InvalidFullNameError()));
    });

    it('should reject name with digits', () => {
      expect(FullName.create('Ivan123')).toEqual(Left(new InvalidFullNameError()));
    });

    it('should reject name with special characters', () => {
      expect(FullName.create('Ivan@Doe')).toEqual(Left(new InvalidFullNameError()));
    });
  });

  describe('raw', () => {
    it('should return branded value without validation', () => {
      expect(FullName.raw('Иван Иванов')).toBe('Иван Иванов');
    });
  });
});
