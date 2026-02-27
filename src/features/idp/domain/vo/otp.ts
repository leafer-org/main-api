import { createHash } from 'node:crypto';

import { CreateDomainError } from '@/infra/ddd/error.js';
import type { ValueObject } from '@/infra/ddd/value-object.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export class InvalidOtpCodeError extends CreateDomainError('invalid_otp_code') {}

export type OtpCode = ValueObject<string, 'OtpCode'>;

export const OtpCode = {
  /** Принимает строку ровно из 6 цифр */
  create: (value: string): Either<InvalidOtpCodeError, OtpCode> => {
    if (!/^\d{6}$/.test(value)) {
      return Left(new InvalidOtpCodeError());
    }
    return Right(value as OtpCode);
  },

  /** Без валидации — для восстановления из доверенного источника */
  raw: (value: string): OtpCode => value as OtpCode,
};

export type OtpCodeHash = ValueObject<string, 'OtpCodeHash'>;

export const OtpCodeHash = {
  create: (value: OtpCode): OtpCodeHash =>
    createHash('sha256').update(value).digest('hex') as OtpCodeHash,

  verify: (code: OtpCode, hash: OtpCodeHash): boolean => OtpCodeHash.create(code) === hash,

  raw: (value: string): OtpCodeHash => value as OtpCodeHash,
};
