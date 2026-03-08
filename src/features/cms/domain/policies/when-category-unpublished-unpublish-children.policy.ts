import type { CategoryEntity } from '../aggregates/category/entity.js';
import type { CategoryUnpublishedEvent } from '@/kernel/domain/events/category.events.js';

type Deps = {
  children: CategoryEntity[];
};

export type UnpublishChildCommand = {
  childId: CategoryEntity['id'];
};

export function whenCategoryUnpublishedUnpublishChildren(
  _event: CategoryUnpublishedEvent,
  deps: Deps,
): UnpublishChildCommand[] {
  return deps.children.filter((c) => c.status === 'published').map((c) => ({ childId: c.id }));
}
