import { type Either, Left, Right } from '@/infra/lib/box.js';

/**
 * Value Object — брендированные типы для type-safe примитивов.
 *
 * ```typescript
 * // VO без валидации
 * export type UserIdVO = ValueObject<string, "UserId">;
 *
 * export const UserIdVO = {
 *   raw: (value: string): UserIdVO => value as UserIdVO,
 * };
 * ```
 *
 * ```typescript
 * // VO с валидацией и методом модификации
 * export type EmailVO = ValueObject<string, "Email">;
 *
 * export const EmailVO = {
 *   create: (value: string): Either<Error, EmailVO> => {
 *     const email = EmailVO.normalize(value as EmailVO);
 *     if (!isValidEmail(email)) return Left(new Error("Invalid email"));
 *     return Right(email);
 *   },
 *   raw: (value: string): EmailVO => value as EmailVO,       // без валидации, для восстановления из БД
 *   domain: (value: EmailVO): string => value.split("@")[1],
 * };
 * ```
 */
export type ValueObject<T, B> = Readonly<T> & {
  __valueObjectBrand: B;
};

export type EmailVO = ValueObject<string, 'Email'>;

export const EamilVO = {
  create: (value: string): Either<Error, EmailVO> => {
    const email = value.toLowerCase().trim();
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return Left(new Error('Invalid email format'));
    }
    return Right(email as EmailVO);
  },
  raw: (value: string): EmailVO => value as EmailVO,
};
