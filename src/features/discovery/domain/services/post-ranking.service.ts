import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '@/infra/lib/clock.js';

import type { PostRankingCandidate } from '../read-models/post-ranking-candidate.read-model.js';

const MS_IN_HOUR = 3_600_000;
const STRONG_BOOST_HOURS = 24;
const MEDIUM_BOOST_HOURS = 48;
const WEAK_BOOST_HOURS = 168; // 7 days

const STRONG_BOOST = 3;
const MEDIUM_BOOST = 2;
const WEAK_BOOST = 1;

const DIVERSITY_WINDOW = 5;
const MAX_OWNER_IN_WINDOW = 2;

@Injectable()
export class PostRankingService {
  public constructor(@Inject(Clock) private readonly clock: Clock) {}

  public apply(candidates: PostRankingCandidate[]): PostRankingCandidate[] {
    const boosted = this.applyUrgencyBoost(candidates);
    return this.applyOwnerDiversity(boosted);
  }

  private applyUrgencyBoost(candidates: PostRankingCandidate[]): PostRankingCandidate[] {
    const now = this.clock.now();

    const scored = candidates.map((c, index) => ({
      candidate: c,
      boost: this.getUrgencyBoost(c, now),
      originalIndex: index,
    }));

    scored.sort((a, b) => {
      if (a.boost !== b.boost) return b.boost - a.boost;
      return a.originalIndex - b.originalIndex;
    });

    return scored.map((s) => s.candidate);
  }

  private getUrgencyBoost(candidate: PostRankingCandidate, now: Date): number {
    if (candidate.hasSchedule || !candidate.nextEventDate) return 0;

    const hoursUntilEvent = (candidate.nextEventDate.getTime() - now.getTime()) / MS_IN_HOUR;
    if (hoursUntilEvent <= 0) return 0;

    if (hoursUntilEvent <= STRONG_BOOST_HOURS) return STRONG_BOOST;
    if (hoursUntilEvent <= MEDIUM_BOOST_HOURS) return MEDIUM_BOOST;
    if (hoursUntilEvent <= WEAK_BOOST_HOURS) return WEAK_BOOST;

    return 0;
  }

  private applyOwnerDiversity(candidates: PostRankingCandidate[]): PostRankingCandidate[] {
    const result: PostRankingCandidate[] = [];
    const remaining = [...candidates];

    while (remaining.length > 0) {
      const next = remaining.shift()!;
      const windowStart = Math.max(0, result.length - DIVERSITY_WINDOW + 1);
      const window = result.slice(windowStart);

      const ownerCountInWindow = window.filter(
        (c) => c.ownerId === next.ownerId,
      ).length;

      if (ownerCountInWindow < MAX_OWNER_IN_WINDOW) {
        result.push(next);
      } else {
        const insertIdx = remaining.findIndex((r) => r.ownerId !== next.ownerId);
        if (insertIdx === -1) {
          result.push(next);
        } else {
          remaining.splice(insertIdx + 1, 0, next);
        }
      }
    }

    return result;
  }
}
