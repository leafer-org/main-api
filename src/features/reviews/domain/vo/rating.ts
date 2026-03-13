import { CreateDomainError } from '@/infra/ddd/error.js';

export type Rating = number & { readonly __brand: 'Rating' };

export class InvalidRatingError extends CreateDomainError('invalid_rating', 400) {}

const VALID_RATINGS = new Set([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);

export const Rating = {
  create(value: number): Rating {
    if (!VALID_RATINGS.has(value)) {
      throw new InvalidRatingError();
    }
    return value as Rating;
  },

  raw(value: number): Rating {
    return value as Rating;
  },

  AUTO_PUBLISH_THRESHOLD: 4 as const,
};
