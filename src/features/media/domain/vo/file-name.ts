import { CreateDomainError } from '@/infra/ddd/error.js';
import type { ValueObject } from '@/infra/ddd/value-object.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export class InvalidFileNameError extends CreateDomainError('invalid_file_name') {}

export type FileName = ValueObject<string, 'FileName'>;

const MIN_LENGTH = 1;
const MAX_LENGTH = 255;

const normalize = (value: string): string => value.trim();

export const FileName = {
  create: (value: string): Either<InvalidFileNameError, FileName> => {
    const normalized = normalize(value);

    if (normalized.length < MIN_LENGTH || normalized.length > MAX_LENGTH) {
      return Left(new InvalidFileNameError());
    }

    return Right(normalized as FileName);
  },

  raw: (value: string): FileName => value as FileName,
};
