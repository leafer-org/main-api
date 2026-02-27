import { CreateDomainError } from '@/infra/ddd/error.js';
import type { ValueObject } from '@/infra/ddd/value-object.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export class InvalidPhoneNumberError extends CreateDomainError('invalid_phone_number') {}

export type PhoneNumber = ValueObject<string, 'PhoneNumber'>;

const E164_REGEX = /^[1-9]\d{6,14}$/;

const normalizeRussianPhone = (digits: string): string => {
  // 89991234567 → 79991234567
  if (digits.length === 11 && digits.startsWith('8')) {
    return `7${digits.slice(1)}`;
  }
  return digits;
};

export const PhoneNumber = {
  /**
   * Парсит строку, очищает от нецифровых символов, нормализует российский 8-префикс.
   * Возвращает Left(InvalidPhoneNumberError) если номер не соответствует E.164.
   */
  create: (value: string): Either<InvalidPhoneNumberError, PhoneNumber> => {
    const digits = value.replace(/\D/g, '');
    const normalized = normalizeRussianPhone(digits);

    if (!E164_REGEX.test(normalized)) {
      return Left(new InvalidPhoneNumberError());
    }

    return Right(normalized as PhoneNumber);
  },

  /** Без валидации — для восстановления из БД (уже нормализовано) */
  raw: (value: string): PhoneNumber => value as PhoneNumber,
};
