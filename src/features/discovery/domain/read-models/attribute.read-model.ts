import type { CategoryAttribute } from '@/kernel/domain/events/category.events.js';
import type { AttributeId, CategoryId } from '@/kernel/domain/ids.js';
import type { AttributeSchema } from '@/kernel/domain/vo/attribute.js';

export type AttributeReadModel = {
  attributeId: AttributeId;
  categoryId: CategoryId;
  name: string;
  required: boolean;
  schema: AttributeSchema;
  createdAt: Date;
  updatedAt: Date;
};

export function projectAttributes(categoryId: CategoryId, attrs: CategoryAttribute[], now: Date): AttributeReadModel[] {
  return attrs.map(a => ({
    attributeId: a.attributeId,
    categoryId,
    name: a.name,
    required: a.required,
    schema: a.schema,
    createdAt: now,
    updatedAt: now,
  }));
}
