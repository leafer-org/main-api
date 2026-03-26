import type { BoardSubscriptionEntity } from '../aggregates/board/entities/board-subscription.entity.js';
import type { SubscriptionFilter } from '../vo/filters.js';

export function matchesSubscriptionFilters(
  subscription: BoardSubscriptionEntity,
  eventId: string,
): boolean {
  if (subscription.filters.length === 0) return true;

  return subscription.filters.every((filter) => matchesFilter(filter, eventId));
}

function matchesFilter(filter: SubscriptionFilter, eventId: string): boolean {
  switch (filter.type) {
    case 'programmatic':
      return matchesProgrammaticFilter(filter.filterId, filter.params, eventId);
    case 'json-logic':
      // JSON-logic filters are not yet implemented
      return true;
  }
}

function matchesProgrammaticFilter(
  filterId: string,
  params: Record<string, unknown>,
  eventId: string,
): boolean {
  switch (filterId) {
    case 'every-nth': {
      const n = (params.n as number) ?? 1;
      if (n <= 1) return true;
      return hashToNumber(eventId) % n === 0;
    }
    case 'random-sample': {
      const percent = (params.percent as number) ?? 100;
      return (hashToNumber(eventId) % 100) < percent;
    }
    case 'first-time-org':
    case 'repeat-offender':
    case 'high-price':
      // These filters require external data and are not yet implemented
      return true;
    default:
      return true;
  }
}

function hashToNumber(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}
