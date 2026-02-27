import { describe, expect, it } from 'vitest';

import { InvalidPhoneNumberError, PhoneNumber } from './phone-number.js';
import { Left, Right } from '@/infra/lib/box.js';

describe('PhoneNumber', () => {
  describe('create', () => {
    it('should normalize +7 format', () => {
      expect(PhoneNumber.create('+7 999 123-45-67')).toEqual(Right(PhoneNumber.raw('79991234567')));
    });

    it('should normalize 8-prefix to 7 for russian numbers', () => {
      expect(PhoneNumber.create('89991234567')).toEqual(Right(PhoneNumber.raw('79991234567')));
    });

    it('should handle formatted russian number with 8', () => {
      expect(PhoneNumber.create('8 (999) 123-45-67')).toEqual(
        Right(PhoneNumber.raw('79991234567')),
      );
    });

    it('should accept plain digits with 7', () => {
      expect(PhoneNumber.create('79991234567')).toEqual(Right(PhoneNumber.raw('79991234567')));
    });

    it('should accept international numbers', () => {
      expect(PhoneNumber.create('+1 555 123 4567')).toEqual(Right(PhoneNumber.raw('15551234567')));
    });

    it('should reject too short number', () => {
      expect(PhoneNumber.create('123456')).toEqual(Left(new InvalidPhoneNumberError()));
    });

    it('should reject too long number', () => {
      expect(PhoneNumber.create('1234567890123456')).toEqual(Left(new InvalidPhoneNumberError()));
    });

    it('should reject number starting with 0', () => {
      expect(PhoneNumber.create('09991234567')).toEqual(Left(new InvalidPhoneNumberError()));
    });

    it('should reject empty string', () => {
      expect(PhoneNumber.create('')).toEqual(Left(new InvalidPhoneNumberError()));
    });
  });

  describe('raw', () => {
    it('should return branded value without validation', () => {
      expect(PhoneNumber.raw('79991234567')).toBe('79991234567');
    });
  });
});
