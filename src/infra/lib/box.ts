/** biome-ignore-all lint/nursery/noShadow: overload */
/** biome-ignore-all lint/suspicious/noExplicitAny: any */

export type Left<T> = {
  type: 'left';
  error: T;
};

export type Right<T> = {
  type: 'success';
  value: T;
};

export type Empty = {
  type: 'empty';
};

export type Option<T> = Right<T> | Empty;
export type Either<L, R> = Left<L> | Right<R>;
export type Box<L, R> = Left<L> | Right<R> | Empty;

export type AnyBox = Box<unknown, unknown>;

export const Left = <E>(error: E): Left<E> => ({
  type: 'left',
  error,
});

export const Right = <T>(value: T): Right<T> => ({
  type: 'success',
  value,
});

export const Empty: Empty = {
  type: 'empty',
};

export const isLeft = <L extends Left<any> | Right<any> | Empty>(
  box: L,
): box is L extends Left<any> ? L : never => box.type === 'left';

export const isRight = <R>(box: Box<unknown, R>): box is Right<R> => box.type === 'success';

export const isEmpty = (box: AnyBox): box is Empty => box.type === 'empty';

export const rightOrUndefined = <R>(box: Box<unknown, R>): R | undefined => {
  if (isEmpty(box)) {
    return undefined as R;
  }
  if (isLeft(box)) {
    return undefined as R;
  }
  return box.value;
};

export const unwrap = <R>(box: Box<unknown, R>): R => {
  if (isEmpty(box)) {
    throw new Error('Box is empty');
  }
  if (isLeft(box)) {
    throw new Error(`Box is left: ${JSON.stringify(box.error)}`);
  }
  return box.value;
};

export function joinEithers<T extends readonly Either<unknown, unknown>[]>(
  ...eithers: T
): Either<
  {
    [K in keyof T]: T[K] extends Either<infer L, infer _> ? L : never;
  }[number],
  {
    [K in keyof T]: T[K] extends Either<infer _, infer R> ? R : never;
  }
> {
  return eithers.reduce((acc: Either<unknown, unknown[]>, curr: Either<unknown, unknown>) => {
    if (isLeft(acc)) {
      return acc;
    }
    if (isLeft(curr)) {
      return curr;
    }

    acc.value.push(curr.value);
    return acc;
  }, Right([])) as never;
}

export function joinEithersAggregated<T extends readonly Either<unknown, unknown>[]>(
  ...eithers: T
): Either<
  {
    [K in keyof T]: T[K] extends Either<infer L, infer _> ? L : never;
  }[number][],
  {
    [K in keyof T]: T[K] extends Either<infer _, infer R> ? R : never;
  }
> {
  return eithers.reduce(
    (acc: Either<unknown[], unknown[]>, curr: Either<unknown, unknown>) => {
      if (isLeft(acc)) {
        if (isLeft(curr)) {
          acc.error.push(curr.error);
          return acc;
        }

        return acc;
      }
      if (isLeft(curr)) {
        return Left([curr.error]);
      }

      acc.value.push(curr.value);

      return acc;
    },
    Right([]) as Either<unknown[], unknown[]>,
  ) as never;
}

export function mapRight<L, R, NR, NL = never>(
  mapper: (value: R) => NR | Either<NL, NR>,
): (either: Either<L, R>) => Either<NL | L, NR>;
export function mapRight<L, R, NR, NL = never>(
  either: Either<L, R>,
  mapper: (value: R) => NR | Either<NL, NR>,
): Either<NL | L, NR | NL>;

export function mapRight(eitherOrMapper: any, optionalMapper?: (value: unknown) => unknown): any {
  if (typeof eitherOrMapper !== 'function' && optionalMapper) {
    if (isLeft(eitherOrMapper)) {
      return eitherOrMapper;
    }

    const result = optionalMapper((eitherOrMapper as Right<unknown>).value);

    if (isLeft(result as never)) {
      return result;
    }

    if (isRight(result as never)) {
      return result;
    }

    return Right(result as never);
  }
  return (either: Either<unknown, unknown>) => mapRight(either, eitherOrMapper);
}

export function mapLeft<L, R, NL, NR = never>(
  mapper: (value: L) => NL | Either<NL, NR>,
): (either: Either<L, R>) => Either<NL, R | NR>;
export function mapLeft<L, R, NL, NR = never>(
  either: Either<L, R>,
  mapper: (value: L) => NL | Either<NL, NR>,
): Either<NL, R | NR>;

export function mapLeft(eitherOrMapper: any, optionalMapper?: (value: unknown) => unknown): any {
  if (typeof eitherOrMapper !== 'function' && optionalMapper) {
    if (isRight(eitherOrMapper)) {
      return eitherOrMapper;
    }
    const result = optionalMapper(eitherOrMapper.error);

    if (isLeft(result as never)) {
      return result;
    }

    if (isRight(result as never)) {
      return result;
    }

    return Left(result as never);
  }
  return (either: Either<unknown, unknown>) => mapLeft(either, eitherOrMapper);
}

export function pipe<T>(value: T): T;

export function pipe<T, R>(value: T, fn: (value: T) => R): R;

export function pipe<T, R, S>(value: T, fn: (value: T) => R, fn2: (value: R) => S): S;

export function pipe<T, R, S, U>(
  value: T,
  fn: (value: T) => R,
  fn2: (value: R) => S,
  fn3: (value: S) => U,
): U;

export function pipe<T, R, S, U, V>(
  value: T,
  fn: (value: T) => R,
  fn2: (value: R) => S,
  fn3: (value: S) => U,
  fn4: (value: U) => V,
): V;

export function pipe<T, R, S, U, V, W>(
  value: T,
  fn: (value: T) => R,
  fn2: (value: R) => S,
  fn3: (value: S) => U,
  fn4: (value: U) => V,
  fn5: (value: V) => W,
): W;

export function pipe<T, R, S, U, V, W, X>(
  value: T,
  fn: (value: T) => R,
  fn2: (value: R) => S,
  fn3: (value: S) => U,
  fn4: (value: U) => V,
  fn5: (value: V) => W,
  fn6: (value: W) => X,
): X;
export function pipe<T, R, S, U, V, W, X, Y>(
  value: T,
  fn: (value: T) => R,
  fn2: (value: R) => S,
  fn3: (value: S) => U,
  fn4: (value: U) => V,
  fn5: (value: V) => W,
  fn6: (value: W) => X,
  fn7: (value: X) => Y,
): Y;
export function pipe<T, R, S, U, V, W, X, Y, Z>(
  value: T,
  fn: (value: T) => R,
  fn2: (value: R) => S,
  fn3: (value: S) => U,
  fn4: (value: U) => V,
  fn5: (value: V) => W,
  fn6: (value: W) => X,
  fn7: (value: X) => Y,
  fn8: (value: Y) => Z,
): Z;
export function pipe<T, R, S, U, V, W, X, Y, Z>(
  value: T,
  fn: (value: T) => R,
  fn2: (value: R) => S,
  fn3: (value: S) => U,
  fn4: (value: U) => V,
  fn5: (value: V) => W,
  fn6: (value: W) => X,
  fn7: (value: X) => Y,
  fn8: (value: Y) => Z,
): Z;
export function pipe(value: unknown, ...fns: ((value: unknown) => unknown)[]): unknown {
  return fns.reduce((acc, fn) => fn(acc), value);
}
