import type { AttributeId } from '../ids.js';
import type { AttributeSchema } from './attribute.js';

export type CategoryAttribute = {
  attributeId: AttributeId;
  name: string;
  required: boolean;
  schema: AttributeSchema;
};

export const CategoryAttribute = {
  mergeWithAncestors(
    category: { attributes: CategoryAttribute[] },
    ancestors: { attributes: CategoryAttribute[] }[],
  ): { attributeId: AttributeId; name: string; schema: AttributeSchema }[] {
    const seen = new Set<string>();
    const merged: { attributeId: AttributeId; name: string; schema: AttributeSchema }[] = [];

    for (const attr of category.attributes) {
      seen.add(attr.attributeId as string);
      merged.push({
        attributeId: attr.attributeId,
        name: attr.name,
        schema: attr.schema,
      });
    }

    for (const ancestor of ancestors) {
      for (const attr of ancestor.attributes) {
        if (!seen.has(attr.attributeId as string)) {
          seen.add(attr.attributeId as string);
          merged.push({
            attributeId: attr.attributeId,
            name: attr.name,
            schema: attr.schema,
          });
        }
      }
    }

    return merged;
  },
};
