import { CreateDomainError } from '@/infra/ddd/error.js';
import type { ValueObject } from '@/infra/ddd/value-object.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export class InvalidFullNameError extends CreateDomainError('invalid_full_name') {}

export type FullName = ValueObject<string, 'FullName'>;

const MIN_LENGTH = 2;
const MAX_LENGTH = 100;

// Буквы любого языка, пробелы, дефисы, апострофы (O'Brien, Мария-Иванова)
const VALID_CHARS_REGEX = /^[\p{L}\s'-]+$/u;

const normalize = (value: string): string => value.trim().replace(/\s+/g, ' ');

export const FullName = {
  /**
   * Нормализует пробелы и проверяет:
   * - не пустое
   * - длина от 2 до 100 символов
   * - только буквы (unicode), пробелы, дефисы, апострофы
   */
  create: (value: string): Either<InvalidFullNameError, FullName> => {
    const normalized = normalize(value);

    if (normalized.length < MIN_LENGTH || normalized.length > MAX_LENGTH) {
      return Left(new InvalidFullNameError());
    }

    if (!VALID_CHARS_REGEX.test(normalized)) {
      return Left(new InvalidFullNameError());
    }

    return Right(normalized as FullName);
  },

  /** Без валидации — для восстановления из БД (уже нормализовано) */
  raw: (value: string): FullName => value as FullName,
};
