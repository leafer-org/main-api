import type { SubscriptionFilter } from '../vo/filters.js';

export function matchesSubscriptionFilters(
  subscription: { filters: SubscriptionFilter[] },
  eventId: string,
): boolean {
  if (subscription.filters.length === 0) return true;

  return subscription.filters.every((filter) => matchesFilter(filter, eventId));
}

function matchesFilter(filter: SubscriptionFilter, eventId: string): boolean {
  switch (filter.type) {
    case 'json-logic':
      // JSON-logic filters are not yet implemented
      return true;
    case 'every-nth': {
      const n = filter.n ?? 1;
      if (n <= 1) return true;
      return hashToNumber(eventId) % n === 0;
    }
    case 'random-sample': {
      const percent = filter.percent ?? 100;
      return (hashToNumber(eventId) % 100) < percent;
    }
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
