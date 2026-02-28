import type { AttributeIntegrationEvent } from '@/kernel/domain/events/attribute.events.js';
import { assertNever } from '@/infra/ddd/utils.js';
import type { AttributeReadModel } from './attribute.read-model.js';

export function attributeProject(
  state: AttributeReadModel | null,
  event: AttributeIntegrationEvent,
): AttributeReadModel | null {
  switch (event.type) {
    case 'attribute.created': {
      return {
        attributeId: event.attributeId,
        categoryId: event.categoryId,
        name: event.name,
        schema: event.schema,
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
      };
    }

    case 'attribute.updated': {
      if (!state) throw new Error('State is required for attribute.updated');

      return {
        ...state,
        name: event.name,
        schema: event.schema,
        updatedAt: event.updatedAt,
      };
    }

    case 'attribute.deleted': {
      return null;
    }

    default:
      assertNever(event);
  }
}
