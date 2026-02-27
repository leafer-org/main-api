import { CreateDomainError } from '@/infra/ddd/error.js';
import type { ValueObject } from '@/infra/ddd/value-object.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export class InvalidIpError extends CreateDomainError('invalid_ip') {}

export type IpAddress = ValueObject<string, 'IpAddress'>;

export const IpAddress = {
  /** Принимает строку в формате IPv4 (x.x.x.x) */
  create: (value: string): Either<InvalidIpError, IpAddress> => {
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
      return Left(new InvalidIpError());
    }
    return Right(value as IpAddress);
  },

  /** Без валидации — для доверенного источника (req.ip, БД) */
  raw: (value: string): IpAddress => value as IpAddress,
};
