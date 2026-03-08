import type { CategoryEntity } from '../aggregates/category/entity.js';
import type { CategoryPublishedEvent } from '@/kernel/domain/events/category.events.js';

type Deps = {
  children: CategoryEntity[];
};

export type RepublishChildCommand = {
  childId: CategoryEntity['id'];
};

export function whenCategoryPublishedRepublishChildren(
  _event: CategoryPublishedEvent,
  deps: Deps,
): RepublishChildCommand[] {
  return deps.children.filter((c) => c.status === 'published').map((c) => ({ childId: c.id }));
}
