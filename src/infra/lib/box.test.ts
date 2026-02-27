import { describe, expect, it } from 'vitest';

import {
  type Either,
  Empty,
  isEmpty,
  isLeft,
  isRight,
  joinEithers,
  joinEithersAggregated,
  Left,
  mapLeft,
  mapRight,
  pipe,
  Right,
  rightOrUndefined,
  unwrap,
} from './box.js';

describe('box', () => {
  describe('constructors', () => {
    it('Left creates a left box', () => {
      const result = Left('error');
      expect(result).toEqual({ type: 'left', error: 'error' });
    });

    it('Right creates a right box', () => {
      const result = Right(42);
      expect(result).toEqual({ type: 'success', value: 42 });
    });

    it('Empty is an empty box', () => {
      expect(Empty).toEqual({ type: 'empty' });
    });
  });

  describe('type guards', () => {
    describe('isLeft', () => {
      it('returns true for Left', () => {
        expect(isLeft(Left('error'))).toBe(true);
      });

      it('returns false for Right', () => {
        expect(isLeft(Right(42))).toBe(false);
      });

      it('returns false for Empty', () => {
        expect(isLeft(Empty)).toBe(false);
      });
    });

    describe('isRight', () => {
      it('returns true for Right', () => {
        expect(isRight(Right(42))).toBe(true);
      });

      it('returns false for Left', () => {
        expect(isRight(Left('error'))).toBe(false);
      });

      it('returns false for Empty', () => {
        expect(isRight(Empty)).toBe(false);
      });
    });

    describe('isEmpty', () => {
      it('returns true for Empty', () => {
        expect(isEmpty(Empty)).toBe(true);
      });

      it('returns false for Left', () => {
        expect(isEmpty(Left('error'))).toBe(false);
      });

      it('returns false for Right', () => {
        expect(isEmpty(Right(42))).toBe(false);
      });
    });
  });

  describe('rightOrUndefined', () => {
    it('returns value for Right', () => {
      expect(rightOrUndefined(Right(42))).toBe(42);
    });

    it('returns undefined for Left', () => {
      expect(rightOrUndefined(Left('error'))).toBeUndefined();
    });

    it('returns undefined for Empty', () => {
      expect(rightOrUndefined(Empty)).toBeUndefined();
    });
  });

  describe('unwrap', () => {
    it('returns value for Right', () => {
      expect(unwrap(Right(42))).toBe(42);
    });

    it('throws for Left', () => {
      expect(() => unwrap(Left('error'))).toThrow('Box is left: "error"');
    });

    it('throws for Empty', () => {
      expect(() => unwrap(Empty)).toThrow('Box is empty');
    });

    it('throws with JSON stringified error for Left with object', () => {
      expect(() => unwrap(Left({ code: 'ERROR' }))).toThrow('Box is left: {"code":"ERROR"}');
    });
  });

  describe('joinEithers', () => {
    it('joins multiple Right values into array', () => {
      const result = joinEithers(Right(1), Right(2), Right(3));
      expect(result).toEqual(Right([1, 2, 3]));
    });

    it('returns first Left if any Either is Left', () => {
      const result = joinEithers(Right(1), Left('error'), Right(3));
      expect(result).toEqual(Left('error'));
    });

    it('returns first Left when multiple Lefts exist', () => {
      const result = joinEithers(Left('first'), Left('second'), Right(3));
      expect(result).toEqual(Left('first'));
    });

    it('handles empty array', () => {
      const result = joinEithers();
      expect(result).toEqual(Right([]));
    });

    it('handles single Right', () => {
      const result = joinEithers(Right(42));
      expect(result).toEqual(Right([42]));
    });

    it('handles single Left', () => {
      const result = joinEithers(Left('error'));
      expect(result).toEqual(Left('error'));
    });
  });

  describe('joinEithersAggregated', () => {
    it('joins multiple Right values into array', () => {
      const result = joinEithersAggregated(Right(1), Right(2), Right(3));
      expect(result).toEqual(Right([1, 2, 3]));
    });

    it('aggregates all Left errors into array', () => {
      const result = joinEithersAggregated(Right(1), Left('error1'), Left('error2'));
      expect(result as unknown).toEqual(Left(['error1', 'error2']));
    });

    it('collects all Lefts when all are Left', () => {
      const result = joinEithersAggregated(Left('a'), Left('b'), Left('c'));
      expect(result as unknown).toEqual(Left(['a', 'b', 'c']));
    });

    it('handles empty array', () => {
      const result = joinEithersAggregated();
      expect(result).toEqual(Right([]));
    });

    it('handles single Right', () => {
      const result = joinEithersAggregated(Right(42));
      expect(result).toEqual(Right([42]));
    });

    it('handles single Left', () => {
      const result = joinEithersAggregated(Left('error'));
      expect(result as unknown).toEqual(Left(['error']));
    });
  });

  describe('mapRight', () => {
    describe('curried form', () => {
      it('maps Right value', () => {
        const mapper = mapRight((x: number) => x * 2);
        expect(mapper(Right(21))).toEqual(Right(42));
      });

      it('passes through Left unchanged', () => {
        const mapper = mapRight((x: number) => x * 2);
        expect(mapper(Left('error'))).toEqual(Left('error'));
      });

      it('handles mapper returning Either', () => {
        const mapper = mapRight((x: number) => (x > 0 ? Right(x) : Left('negative')));
        expect(mapper(Right(5))).toEqual(Right(5));
        expect(mapper(Right(-5))).toEqual(Left('negative'));
      });
    });

    describe('direct form', () => {
      it('maps Right value', () => {
        const result = mapRight(Right(21), (x) => x * 2);
        expect(result).toEqual(Right(42));
      });

      it('passes through Left unchanged', () => {
        const result = mapRight(Left('error') as Either<string, number>, (x) => x * 2);
        expect(result).toEqual(Left('error'));
      });

      it('handles mapper returning Right', () => {
        const result = mapRight(Right(5), (x) => Right(x * 2));
        expect(result).toEqual(Right(10));
      });

      it('handles mapper returning Left', () => {
        const result = mapRight(Right(-5), (x) => (x > 0 ? Right(x) : Left('negative')));
        expect(result).toEqual(Left('negative'));
      });
    });
  });

  describe('mapLeft', () => {
    describe('curried form', () => {
      it('maps Left value', () => {
        const mapper = mapLeft((e: string) => `Error: ${e}`);
        expect(mapper(Left('oops'))).toEqual(Left('Error: oops'));
      });

      it('passes through Right unchanged', () => {
        const mapper = mapLeft((e: string) => `Error: ${e}`);
        expect(mapper(Right(42))).toEqual(Right(42));
      });
    });

    describe('direct form', () => {
      it('maps Left value', () => {
        const result = mapLeft(Left('oops'), (e) => `Error: ${e}`);
        expect(result).toEqual(Left('Error: oops'));
      });

      it('passes through Right unchanged', () => {
        const result = mapLeft(Right(42) as Either<string, number>, (e) => `Error: ${e}`);
        expect(result).toEqual(Right(42));
      });
    });
  });

  describe('pipe', () => {
    it('returns value when no functions provided', () => {
      expect(pipe(42)).toBe(42);
    });

    it('applies single function', () => {
      expect(pipe(21, (x) => x * 2)).toBe(42);
    });

    it('applies two functions in sequence', () => {
      expect(
        pipe(
          10,
          (x) => x * 2,
          (x) => x + 1,
        ),
      ).toBe(21);
    });

    it('applies multiple functions in sequence', () => {
      expect(
        pipe(
          1,
          (x) => x + 1,
          (x) => x * 2,
          (x) => x + 3,
          (x) => x * 4,
        ),
      ).toBe(28);
    });

    it('works with mapRight', () => {
      const result = pipe(
        Right(10),
        mapRight((x: number) => x * 2),
        mapRight((x: number) => x + 1),
      );
      expect(result).toEqual(Right(21));
    });

    it('stops at Left with mapRight', () => {
      const result = pipe(
        Right(10),
        mapRight((x: number) => (x > 5 ? Left('too big') : Right(x))),
        mapRight((x: number) => x + 1),
      );
      expect(result).toEqual(Left('too big'));
    });

    it('handles type transformations', () => {
      const result = pipe(
        'hello',
        (s) => s.length,
        (n) => n * 2,
        (n) => n.toString(),
      );
      expect(result).toBe('10');
    });

    it('applies up to 8 functions', () => {
      const result = pipe(
        1,
        (x) => x + 1,
        (x) => x + 1,
        (x) => x + 1,
        (x) => x + 1,
        (x) => x + 1,
        (x) => x + 1,
        (x) => x + 1,
        (x) => x + 1,
      );
      expect(result).toBe(9);
    });
  });

  describe('integration', () => {
    it('complex Either chain with pipe and mapRight', () => {
      const validatePositive = (n: number) => (n > 0 ? Right(n) : Left('must be positive'));
      const validateEven = (n: number) => (n % 2 === 0 ? Right(n) : Left('must be even'));
      const double = (n: number) => n * 2;

      const process = (input: number) =>
        pipe(input, validatePositive, mapRight(validateEven), mapRight(double));

      expect(process(4)).toEqual(Right(8));
      expect(process(-2)).toEqual(Left('must be positive'));
      expect(process(3)).toEqual(Left('must be even'));
    });
  });
});
