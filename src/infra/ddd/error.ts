/**
 * Не наследуйтесь от этого класса напрямую, используйте CreateDomainError
 */
export abstract class DomainError<T extends string, D = void> extends Error {
  public readonly type: T;
  public readonly data: D;
  public constructor(type: T, data?: D, cause?: Error) {
    super(type, { cause });
    this.name = this.constructor.name;
    this.data = data as D;
    this.type = type;
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
export const CreateDomainError = <T extends string>(type: T) => {
  abstract class DomainErrorClass extends DomainError<T, void> {
    public static readonly type = type;

    public constructor(cause?: Error) {
      super(type, undefined, cause);
      Error.captureStackTrace(this, this.constructor);
    }

    public static withData<D>() {
      abstract class DomainErrorWithDataClass extends DomainError<T, D> {
        public static readonly type = type;

        public constructor(data: D, cause?: Error) {
          super(type, data, cause);
        }
      }

      return DomainErrorWithDataClass;
    }
  }

  return DomainErrorClass;
};
