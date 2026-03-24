import type { ValueObject } from '@/infra/ddd/value-object.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import { CreateDomainError } from '@/infra/ddd/error.js';

export class InvalidAgeGroupError extends CreateDomainError('invalid_age_group', 400) {}

// --- AgeGroup (only concrete groups: children | adults) ---
export type AgeGroup = ValueObject<string, 'AgeGroup'>;

const AGE_GROUP_VALUES = new Set(['children', 'adults']);

export const AgeGroup = {
  create(value: string): Either<InvalidAgeGroupError, AgeGroup> {
    if (!AGE_GROUP_VALUES.has(value)) return Left(new InvalidAgeGroupError());
    return Right(value as AgeGroup);
  },
  restore(value: string): AgeGroup {
    return value as AgeGroup;
  },
};

// --- AgeGroupOption (includes 'all') ---
export type AgeGroupOption = ValueObject<'children' | 'adults' | 'all', 'AgeGroupOption'>;

const AGE_GROUP_OPTION_VALUES = new Set(['children', 'adults', 'all']);

export const AgeGroupOption = {
  create(value: string): Either<InvalidAgeGroupError, AgeGroupOption> {
    if (!AGE_GROUP_OPTION_VALUES.has(value)) return Left(new InvalidAgeGroupError());
    return Right(value as AgeGroupOption);
  },
  restore(value: string): AgeGroupOption {
    return value as AgeGroupOption;
  },
};
