import { describe, expect, it } from 'vitest';

import { ReviewEntity } from './entity.js';
import type { ReviewState } from './state.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { OrganizationId, ReviewId, UserId } from '@/kernel/domain/ids.js';
import { Rating } from '../../vo/rating.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const REVIEW_ID = ReviewId.raw('review-1');
const AUTHOR_ID = UserId.raw('user-1');
const ORG_ID = OrganizationId.raw('org-1');
const TARGET = { targetType: 'item' as const, itemId: 'item-1' as any };
const NOW = new Date('2024-06-01T12:00:00.000Z');
const LATER = new Date('2024-06-02T12:00:00.000Z');

const makePublished = (overrides?: Partial<ReviewState>): ReviewState => ({
  reviewId: REVIEW_ID,
  authorId: AUTHOR_ID,
  target: TARGET,
  organizationId: ORG_ID,
  rating: Rating.raw(4.5),
  text: 'Great service',
  status: 'published',
  replyText: null,
  repliedBy: null,
  repliedAt: null,
  disputeReason: null,
  disputedBy: null,
  disputedAt: null,
  wasDisputed: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makePending = (overrides?: Partial<ReviewState>): ReviewState =>
  makePublished({ status: 'pending', rating: Rating.raw(3), ...overrides });

const makeDisputed = (overrides?: Partial<ReviewState>): ReviewState =>
  makePublished({
    status: 'disputed',
    wasDisputed: true,
    disputeReason: 'Fake review',
    disputedBy: UserId.raw('seller-1'),
    disputedAt: NOW,
    ...overrides,
  });

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('ReviewEntity', () => {
  describe('create', () => {
    it('rating >= 4 → published с newRating/newReviewCount', () => {
      const result = ReviewEntity.create(null, {
        type: 'CreateReview',
        reviewId: REVIEW_ID,
        authorId: AUTHOR_ID,
        target: TARGET,
        organizationId: ORG_ID,
        rating: Rating.raw(4.5),
        text: 'Great',
        now: NOW,
        currentCount: 2,
        currentSum: 9,
      });

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.state.status).toBe('published');
        expect(result.value.event.status).toBe('published');
        expect(result.value.event.newRating).toBeCloseTo(4.5);
        expect(result.value.event.newReviewCount).toBe(3);
      }
    });

    it('rating < 4 → pending без рейтинга', () => {
      const result = ReviewEntity.create(null, {
        type: 'CreateReview',
        reviewId: REVIEW_ID,
        authorId: AUTHOR_ID,
        target: TARGET,
        organizationId: ORG_ID,
        rating: Rating.raw(2),
        text: 'Bad',
        now: NOW,
        currentCount: 0,
        currentSum: 0,
      });

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.state.status).toBe('pending');
        expect(result.value.event.status).toBe('pending');
        expect(result.value.event.newRating).toBeNull();
        expect(result.value.event.newReviewCount).toBe(0);
      }
    });

    it('инициализирует все поля состояния корректно', () => {
      const result = ReviewEntity.create(null, {
        type: 'CreateReview',
        reviewId: REVIEW_ID,
        authorId: AUTHOR_ID,
        target: TARGET,
        organizationId: ORG_ID,
        rating: Rating.raw(5),
        text: null,
        now: NOW,
        currentCount: 0,
        currentSum: 0,
      });

      if (!isLeft(result)) {
        const s = result.value.state;
        expect(s.replyText).toBeNull();
        expect(s.repliedBy).toBeNull();
        expect(s.disputeReason).toBeNull();
        expect(s.wasDisputed).toBe(false);
        expect(s.createdAt).toBe(NOW);
      }
    });
  });

  describe('edit', () => {
    it('обновляет rating и text для pending-отзыва', () => {
      const state = makePending();
      const result = ReviewEntity.edit(state, {
        type: 'EditReview',
        rating: Rating.raw(2.5),
        text: 'Updated',
        now: LATER,
        currentCount: 0,
        currentSum: 0,
      });

      if (!isLeft(result)) {
        expect(result.value.state.rating).toBe(2.5);
        expect(result.value.state.text).toBe('Updated');
        expect(result.value.state.status).toBe('pending');
        expect(result.value.event.autoPublished).toBe(false);
      }
    });

    it('автопубликация при повышении рейтинга >= 4', () => {
      const state = makePending();
      const result = ReviewEntity.edit(state, {
        type: 'EditReview',
        rating: Rating.raw(4.5),
        now: LATER,
        currentCount: 1,
        currentSum: 5,
      });

      if (!isLeft(result)) {
        expect(result.value.state.status).toBe('published');
        expect(result.value.event.autoPublished).toBe(true);
        expect(result.value.event.newReviewCount).toBe(2);
      }
    });

    it('ошибка если state = null', () => {
      const result = ReviewEntity.edit(null, {
        type: 'EditReview',
        rating: Rating.raw(3),
        now: NOW,
        currentCount: 0,
        currentSum: 0,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) expect(result.error.type).toBe('review_not_found');
    });

    it('ошибка если status != pending', () => {
      const state = makePublished();
      const result = ReviewEntity.edit(state, {
        type: 'EditReview',
        rating: Rating.raw(3),
        now: NOW,
        currentCount: 0,
        currentSum: 0,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) expect(result.error.type).toBe('review_not_pending');
    });
  });

  describe('approve', () => {
    it('pending → published с пересчитанным рейтингом', () => {
      const state = makePending({ rating: Rating.raw(3) });
      const result = ReviewEntity.approve(state, {
        type: 'ApproveReview',
        approvedBy: UserId.raw('mod-1'),
        now: LATER,
        currentCount: 2,
        currentSum: 8,
      });

      if (!isLeft(result)) {
        expect(result.value.state.status).toBe('published');
        expect(result.value.event.newReviewCount).toBe(3);
        expect(result.value.event.newRating).toBeCloseTo(3.667, 2);
      }
    });

    it('ошибка если не pending', () => {
      const state = makePublished();
      const result = ReviewEntity.approve(state, {
        type: 'ApproveReview',
        approvedBy: UserId.raw('mod-1'),
        now: NOW,
        currentCount: 0,
        currentSum: 0,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) expect(result.error.type).toBe('review_not_pending');
    });
  });

  describe('reject', () => {
    it('pending → deleted', () => {
      const state = makePending();
      const result = ReviewEntity.reject(state, {
        type: 'RejectReview',
        rejectedBy: UserId.raw('mod-1'),
        reason: 'Spam',
        now: LATER,
      });

      if (!isLeft(result)) {
        expect(result.value.state.status).toBe('deleted');
        expect(result.value.event.type).toBe('review.rejected');
      }
    });

    it('ошибка если не pending', () => {
      const state = makePublished();
      const result = ReviewEntity.reject(state, {
        type: 'RejectReview',
        rejectedBy: UserId.raw('mod-1'),
        reason: 'Spam',
        now: NOW,
      });
      expect(isLeft(result)).toBe(true);
    });
  });

  describe('delete', () => {
    it('published → deleted с пересчитанным рейтингом', () => {
      const state = makePublished({ rating: Rating.raw(4) });
      const result = ReviewEntity.delete(state, {
        type: 'DeleteReview',
        deletedBy: UserId.raw('user-1'),
        now: LATER,
        currentCount: 3,
        currentSum: 13,
      });

      if (!isLeft(result)) {
        expect(result.value.state.status).toBe('deleted');
        expect(result.value.event.newReviewCount).toBe(2);
        expect(result.value.event.newRating).toBeCloseTo(4.5);
      }
    });

    it('удаление последнего отзыва → newRating null, count 0', () => {
      const state = makePublished({ rating: Rating.raw(5) });
      const result = ReviewEntity.delete(state, {
        type: 'DeleteReview',
        deletedBy: UserId.raw('user-1'),
        now: LATER,
        currentCount: 1,
        currentSum: 5,
      });

      if (!isLeft(result)) {
        expect(result.value.event.newRating).toBeNull();
        expect(result.value.event.newReviewCount).toBe(0);
      }
    });

    it('ошибка если не published', () => {
      const state = makePending();
      const result = ReviewEntity.delete(state, {
        type: 'DeleteReview',
        deletedBy: UserId.raw('user-1'),
        now: NOW,
        currentCount: 0,
        currentSum: 0,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) expect(result.error.type).toBe('review_not_published');
    });
  });

  describe('reply', () => {
    it('добавляет ответ к published-отзыву', () => {
      const state = makePublished();
      const result = ReviewEntity.reply(state, {
        type: 'ReplyToReview',
        repliedBy: UserId.raw('owner-1'),
        replyText: 'Thank you!',
        now: LATER,
      });

      if (!isLeft(result)) {
        expect(result.value.state.replyText).toBe('Thank you!');
        expect(result.value.state.repliedBy).toBe('owner-1');
        expect(result.value.state.repliedAt).toBe(LATER);
        expect(result.value.event.type).toBe('review.replied');
      }
    });

    it('ошибка если уже есть ответ', () => {
      const state = makePublished({ replyText: 'Already replied' });
      const result = ReviewEntity.reply(state, {
        type: 'ReplyToReview',
        repliedBy: UserId.raw('owner-1'),
        replyText: 'Again',
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) expect(result.error.type).toBe('review_already_replied');
    });

    it('ошибка если не published', () => {
      const state = makePending();
      const result = ReviewEntity.reply(state, {
        type: 'ReplyToReview',
        repliedBy: UserId.raw('owner-1'),
        replyText: 'Thanks',
        now: LATER,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) expect(result.error.type).toBe('review_not_published');
    });
  });

  describe('dispute', () => {
    it('published → disputed, wasDisputed = true, рейтинг пересчитан', () => {
      const state = makePublished({ rating: Rating.raw(4) });
      const result = ReviewEntity.dispute(state, {
        type: 'DisputeReview',
        disputedBy: UserId.raw('seller-1'),
        reason: 'Fake review',
        now: LATER,
        currentCount: 3,
        currentSum: 12,
      });

      if (!isLeft(result)) {
        expect(result.value.state.status).toBe('disputed');
        expect(result.value.state.wasDisputed).toBe(true);
        expect(result.value.state.disputeReason).toBe('Fake review');
        expect(result.value.event.newReviewCount).toBe(2);
        expect(result.value.event.newRating).toBeCloseTo(4);
      }
    });

    it('ошибка если уже был оспорен (wasDisputed = true)', () => {
      const state = makePublished({ wasDisputed: true });
      const result = ReviewEntity.dispute(state, {
        type: 'DisputeReview',
        disputedBy: UserId.raw('seller-1'),
        reason: 'Again',
        now: LATER,
        currentCount: 1,
        currentSum: 4.5,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) expect(result.error.type).toBe('review_already_disputed');
    });

    it('ошибка если не published', () => {
      const state = makePending();
      const result = ReviewEntity.dispute(state, {
        type: 'DisputeReview',
        disputedBy: UserId.raw('seller-1'),
        reason: 'Fake',
        now: LATER,
        currentCount: 0,
        currentSum: 0,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) expect(result.error.type).toBe('review_not_published');
    });
  });

  describe('resolveDispute', () => {
    it('uphold → published, рейтинг восстановлен', () => {
      const state = makeDisputed({ rating: Rating.raw(4.5) });
      const result = ReviewEntity.resolveDispute(state, {
        type: 'ResolveDispute',
        resolvedBy: UserId.raw('mod-1'),
        resolution: 'uphold',
        now: LATER,
        currentCount: 2,
        currentSum: 9,
      });

      if (!isLeft(result)) {
        expect(result.value.state.status).toBe('published');
        expect(result.value.event.type).toBe('review.dispute-upheld');
        if (result.value.event.type === 'review.dispute-upheld') {
          expect(result.value.event.newReviewCount).toBe(3);
          expect(result.value.event.newRating).toBeCloseTo(4.5);
        }
      }
    });

    it('remove → deleted', () => {
      const state = makeDisputed();
      const result = ReviewEntity.resolveDispute(state, {
        type: 'ResolveDispute',
        resolvedBy: UserId.raw('mod-1'),
        resolution: 'remove',
        now: LATER,
        currentCount: 2,
        currentSum: 9,
      });

      if (!isLeft(result)) {
        expect(result.value.state.status).toBe('deleted');
        expect(result.value.event.type).toBe('review.dispute-removed');
      }
    });

    it('ошибка если не disputed', () => {
      const state = makePublished();
      const result = ReviewEntity.resolveDispute(state, {
        type: 'ResolveDispute',
        resolvedBy: UserId.raw('mod-1'),
        resolution: 'uphold',
        now: LATER,
        currentCount: 0,
        currentSum: 0,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) expect(result.error.type).toBe('review_not_disputed');
    });

    it('ошибка если state = null', () => {
      const result = ReviewEntity.resolveDispute(null, {
        type: 'ResolveDispute',
        resolvedBy: UserId.raw('mod-1'),
        resolution: 'uphold',
        now: LATER,
        currentCount: 0,
        currentSum: 0,
      });
      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) expect(result.error.type).toBe('review_not_found');
    });
  });
});
