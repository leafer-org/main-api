import { describe, expect, it } from 'vitest';

import { InvalidOtpCodeError, OtpCode, OtpCodeHash } from './otp.js';
import { Left, Right } from '@/infra/lib/box.js';

describe('OtpCode', () => {
  describe('create', () => {
    it('should accept valid 6-digit code', () => {
      expect(OtpCode.create('123456')).toEqual(Right(OtpCode.raw('123456')));
    });

    it('should accept code with leading zeros', () => {
      expect(OtpCode.create('012345')).toEqual(Right(OtpCode.raw('012345')));
    });

    it('should reject code with less than 6 digits', () => {
      expect(OtpCode.create('12345')).toEqual(Left(new InvalidOtpCodeError()));
    });

    it('should reject code with more than 6 digits', () => {
      expect(OtpCode.create('1234567')).toEqual(Left(new InvalidOtpCodeError()));
    });

    it('should reject code with letters', () => {
      expect(OtpCode.create('12345a')).toEqual(Left(new InvalidOtpCodeError()));
    });

    it('should reject empty string', () => {
      expect(OtpCode.create('')).toEqual(Left(new InvalidOtpCodeError()));
    });
  });

  describe('raw', () => {
    it('should return branded value without validation', () => {
      expect(OtpCode.raw('123456')).toBe('123456');
    });
  });
});

describe('OtpCodeHash', () => {
  const code = OtpCode.raw('123456');

  describe('create', () => {
    it('should return a sha256 hex string', () => {
      const hash = OtpCodeHash.create(code);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should be deterministic for the same code', () => {
      expect(OtpCodeHash.create(code)).toBe(OtpCodeHash.create(code));
    });

    it('should produce different hashes for different codes', () => {
      expect(OtpCodeHash.create(OtpCode.raw('111111'))).not.toBe(
        OtpCodeHash.create(OtpCode.raw('222222')),
      );
    });
  });

  describe('verify', () => {
    it('should return true for matching code and hash', () => {
      const hash = OtpCodeHash.create(code);
      expect(OtpCodeHash.verify(code, hash)).toBe(true);
    });

    it('should return false for wrong code', () => {
      const hash = OtpCodeHash.create(code);
      expect(OtpCodeHash.verify(OtpCode.raw('000000'), hash)).toBe(false);
    });
  });
});
