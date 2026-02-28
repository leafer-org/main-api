import { describe, expect, it } from 'vitest';

import { AttributeId, CategoryId } from '@/kernel/domain/ids.js';
import type { AttributeSchema } from '@/kernel/domain/attribute.js';
import type { AttributeIntegrationEvent } from '@/kernel/domain/events/attribute.events.js';
import { attributeProject } from './attribute.projection.js';
import type { AttributeReadModel } from './attribute.read-model.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const ATTRIBUTE_ID = AttributeId.raw('attr-1');
const CATEGORY_ID = CategoryId.raw('cat-1');
const NOW = new Date('2024-06-01T12:00:00.000Z');
const LATER = new Date('2024-06-02T12:00:00.000Z');

const TEXT_SCHEMA: AttributeSchema = { type: 'text' };
const ENUM_SCHEMA: AttributeSchema = { type: 'enum', options: ['A', 'B', 'C'] };

const makeAttribute = (): AttributeReadModel => ({
  attributeId: ATTRIBUTE_ID,
  categoryId: CATEGORY_ID,
  name: 'Длительность',
  schema: TEXT_SCHEMA,
  createdAt: NOW,
  updatedAt: NOW,
});

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('attributeProject', () => {
  describe('attribute.created', () => {
    it('создаёт read model из null', () => {
      const event: AttributeIntegrationEvent = {
        type: 'attribute.created',
        attributeId: ATTRIBUTE_ID,
        categoryId: CATEGORY_ID,
        name: 'Длительность',
        schema: TEXT_SCHEMA,
        createdAt: NOW,
      };

      const result = attributeProject(null, event);

      expect(result).toEqual({
        attributeId: ATTRIBUTE_ID,
        categoryId: CATEGORY_ID,
        name: 'Длительность',
        schema: TEXT_SCHEMA,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
  });

  describe('attribute.updated', () => {
    it('обновляет name, schema и updatedAt', () => {
      const state = makeAttribute();
      const event: AttributeIntegrationEvent = {
        type: 'attribute.updated',
        attributeId: ATTRIBUTE_ID,
        name: 'Тип массажа',
        schema: ENUM_SCHEMA,
        updatedAt: LATER,
      };

      const result = attributeProject(state, event);

      expect(result).toEqual({
        ...state,
        name: 'Тип массажа',
        schema: ENUM_SCHEMA,
        updatedAt: LATER,
      });
    });

    it('выбрасывает ошибку если state = null', () => {
      const event: AttributeIntegrationEvent = {
        type: 'attribute.updated',
        attributeId: ATTRIBUTE_ID,
        name: 'Тип массажа',
        schema: ENUM_SCHEMA,
        updatedAt: LATER,
      };

      expect(() => attributeProject(null, event)).toThrow('State is required');
    });
  });

  describe('attribute.deleted', () => {
    it('возвращает null (удаление)', () => {
      const state = makeAttribute();
      const event: AttributeIntegrationEvent = {
        type: 'attribute.deleted',
        attributeId: ATTRIBUTE_ID,
        deletedAt: LATER,
      };

      const result = attributeProject(state, event);

      expect(result).toBeNull();
    });
  });
});
