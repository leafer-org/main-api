import { CreateDomainError } from '@/infra/ddd/error.js';
import type { ValueObject } from '@/infra/ddd/value-object.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export class InvalidMimeTypeError extends CreateDomainError('invalid_mime_type') {}

export type MimeType = ValueObject<string, 'MimeType'>;

const MIME_TYPE_REGEX = /^[\w-]+\/[\w.+-]+$/;

export const MimeType = {
  create: (value: string): Either<InvalidMimeTypeError, MimeType> => {
    const normalized = value.trim().toLowerCase();

    if (!MIME_TYPE_REGEX.test(normalized)) {
      return Left(new InvalidMimeTypeError());
    }

    return Right(normalized as MimeType);
  },

  raw: (value: string): MimeType => value as MimeType,

  isImage: (value: MimeType): boolean => (value as string).startsWith('image/'),
};
