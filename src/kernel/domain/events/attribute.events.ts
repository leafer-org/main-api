import type { AttributeId, CategoryId } from '../ids.js';
import type { AttributeSchema } from '../attribute.js';

export type AttributeCreatedEvent = {
  type: 'attribute.created';
  attributeId: AttributeId;
  categoryId: CategoryId;
  name: string;
  schema: AttributeSchema;
  createdAt: Date;
};

export type AttributeUpdatedEvent = {
  type: 'attribute.updated';
  attributeId: AttributeId;
  name: string;
  schema: AttributeSchema;
  updatedAt: Date;
};

export type AttributeDeletedEvent = {
  type: 'attribute.deleted';
  attributeId: AttributeId;
  deletedAt: Date;
};

export type AttributeIntegrationEvent =
  | AttributeCreatedEvent
  | AttributeUpdatedEvent
  | AttributeDeletedEvent;
