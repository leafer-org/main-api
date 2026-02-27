import { describe, expect, it } from 'vitest';

import { CreateDomainError, DomainError } from './error.js';

describe('CreateDomainError', () => {
  describe('without data', () => {
    class TestError extends CreateDomainError('test_error') {}

    it('should create error with correct type', () => {
      const error = new TestError();

      expect(error.type).toBe('test_error');
    });

    it('should have correct name', () => {
      const error = new TestError();

      expect(error.name).toBe('TestError');
    });

    it('should have message equal to type', () => {
      const error = new TestError();

      expect(error.message).toBe('test_error');
    });

    it('should have undefined data', () => {
      const error = new TestError();

      expect(error.data).toBeUndefined();
    });

    it('should preserve cause', () => {
      const cause = new Error('original error');
      const error = new TestError(cause);

      expect(error.cause).toBe(cause);
    });

    it('should be instance of Error', () => {
      const error = new TestError();

      expect(error).toBeInstanceOf(Error);
    });

    it('should be instance of DomainError', () => {
      const error = new TestError();

      expect(error).toBeInstanceOf(DomainError);
    });

    it('should have static type property', () => {
      expect(TestError.type).toBe('test_error');
    });
  });

  describe('with data', () => {
    type ErrorData = { userId: string; reason: string };

    class TestErrorWithData extends CreateDomainError(
      'test_error_with_data',
    ).withData<ErrorData>() {}

    it('should create error with correct type', () => {
      const error = new TestErrorWithData({ userId: '123', reason: 'invalid' });

      expect(error.type).toBe('test_error_with_data');
    });

    it('should have correct data', () => {
      const data = { userId: '123', reason: 'invalid' };
      const error = new TestErrorWithData(data);

      expect(error.data).toEqual(data);
    });

    it('should preserve cause', () => {
      const cause = new Error('original error');
      const error = new TestErrorWithData({ userId: '123', reason: 'invalid' }, cause);

      expect(error.cause).toBe(cause);
    });

    it('should have static type property', () => {
      expect(TestErrorWithData.type).toBe('test_error_with_data');
    });

    it('should be instance of DomainError', () => {
      const error = new TestErrorWithData({ userId: '123', reason: 'invalid' });

      expect(error).toBeInstanceOf(DomainError);
    });
  });

  describe('multiple error types', () => {
    class NotFoundError extends CreateDomainError('not_found') {}
    class ValidationError extends CreateDomainError('validation').withData<{ field: string }>() {}

    it('should have unique types', () => {
      expect(NotFoundError.type).toBe('not_found');
      expect(ValidationError.type).toBe('validation');
    });

    it('should create distinct error instances', () => {
      const notFound = new NotFoundError();
      const validation = new ValidationError({ field: 'email' });

      expect(notFound.type).not.toBe(validation.type);
    });
  });
});
