/**
 * Не наследуйтесь от этого класса напрямую, используйте CreateDomainError
 */

export abstract class DomainError<
  T extends string,
  // biome-ignore lint/complexity/noBannedTypes: good type
  D = {},
  StatusCode extends number = 500,
> extends Error {
  public readonly type: T;
  public readonly data: D;
  public readonly statusCode: StatusCode;
  public constructor(type: T, statusCode: StatusCode, data?: D, cause?: Error) {
    super(type, { cause });
    this.name = this.constructor.name;
    this.data = data as D;
    this.type = type;
    this.statusCode = statusCode;
  }

  public toResponse(): Record<
    StatusCode,
    {
      statusCode: StatusCode;
      message: string;
      isDomain: true;
      type: T;
      data: D;
    }
  > {
    return {
      [this.statusCode]: {
        statusCode: this.statusCode,
        message: this.message,
        type: this.type,
        isDomain: true,
        data: this.data,
      },
    } as never;
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
          Error.captureStackTrace(this, this.constructor);
        }
      }

      return DomainErrorWithDataClass;
    }
  }

  return DomainErrorClass;
};
