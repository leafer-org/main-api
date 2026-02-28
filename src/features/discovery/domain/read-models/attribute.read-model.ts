import type { AttributeId, CategoryId } from '@/kernel/domain/ids.js';
import type { AttributeSchema } from '@/kernel/domain/attribute.js';

export type AttributeReadModel = {
  attributeId: AttributeId;
  categoryId: CategoryId;
  name: string;
  schema: AttributeSchema;
  createdAt: Date;
  updatedAt: Date;
};
