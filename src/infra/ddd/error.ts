/**
 * Не наследуйтесь от этого класса напрямую, используйте CreateDomainError
 */

// biome-ignore lint/complexity/noBannedTypes: good type
export  abstract class DomainError<T extends string, D = {}, HC extends number = 500> extends Error {
  public readonly type: T;
  public readonly data: D;
  public readonly httpCode: HC;
  public constructor(type: T, httpCode: HC, data?: D, cause?: Error) {
    super(type, { cause });
    this.name = this.constructor.name;
    this.data = data as D;
    this.type = type;
    this.httpCode = httpCode;
  }

  public toResponse(): Record<HC, { type: T; message?: string; data: D }> {
    return {
      [this.httpCode]: {
        type: this.type,
        message: this.message,
        data: this.data,
      },
    };
  }
}

/**
 * Функция для создания доменных ошибок
 *
 * Пример использования:
 * ```ts
 * class UserNotFoundError1 extends CreateDomainError("user_not_found") {}
 * class UserNotFoundError2 extends CreateDomainError("user_not_found").withData<{ userId: UUID }>() {}
 *
 * new UserNotFoundError1();
 * new UserNotFoundError2({ userId: UUID.generate() });
 * ```
 */
export const CreateDomainError = <T extends string, HC extends number = 500>(
  type: T,
  httpCode: HC = 500 as HC,
) => {
  // biome-ignore lint/complexity/noBannedTypes: good type
  abstract class DomainErrorClass extends DomainError<T, {}, HC> {
    public static readonly type = type;

    public constructor(cause?: Error) {
      super(type, httpCode, {}, cause);
      Error.captureStackTrace(this, this.constructor);
    }

    public static withData<D>() {
      abstract class DomainErrorWithDataClass extends DomainError<T, D, HC> {
        public static readonly type = type;

        public constructor(data: D, cause?: Error) {
          super(type, httpCode, data, cause);
        }
      }

      return DomainErrorWithDataClass;
    }
  }

  return DomainErrorClass;
};
