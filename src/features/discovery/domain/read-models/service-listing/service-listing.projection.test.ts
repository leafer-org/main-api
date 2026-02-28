import { describe, expect, it } from 'vitest';

import { ServiceId, ServiceComponentId, CategoryId, FileId } from '@/kernel/domain/ids.js';
import type { ServiceComponent } from '@/kernel/domain/service-component.js';
import type { ServiceIntegrationEvent } from '@/kernel/domain/events/service.events.js';
import { serviceListingProject } from './service-listing.projection.js';
import type { ServiceListingReadModel } from './service-listing.read-model.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const SERVICE_ID = ServiceId.raw('service-1');
const NOW = new Date('2024-06-01T12:00:00.000Z');
const LATER = new Date('2024-06-02T12:00:00.000Z');

const makeComponents = (): ServiceComponent[] => [
  {
    type: 'base-info',
    id: ServiceComponentId.raw('comp-1'),
    title: 'Массаж',
    description: 'Расслабляющий массаж',
    photoId: FileId.raw('photo-1'),
  },
  {
    type: 'category',
    id: ServiceComponentId.raw('comp-2'),
    categoryId: CategoryId.raw('cat-1'),
    attributes: [],
  },
];

const makeListing = (): ServiceListingReadModel => ({
  serviceId: SERVICE_ID,
  components: makeComponents(),
  publishedAt: NOW,
  updatedAt: NOW,
});

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('serviceListingProject', () => {
  describe('service.published', () => {
    it('создаёт read model из null', () => {
      const components = makeComponents();
      const event: ServiceIntegrationEvent = {
        type: 'service.published',
        serviceId: SERVICE_ID,
        components,
        publishedAt: NOW,
      };

      const result = serviceListingProject(null, event);

      expect(result).toEqual({
        serviceId: SERVICE_ID,
        components,
        publishedAt: NOW,
        updatedAt: NOW,
      });
    });
  });

  describe('service.updated', () => {
    it('обновляет components и updatedAt', () => {
      const state = makeListing();
      const newComponents: ServiceComponent[] = [
        {
          type: 'base-info',
          id: ServiceComponentId.raw('comp-1'),
          title: 'Новое название',
          description: 'Новое описание',
          photoId: FileId.raw('photo-2'),
        },
      ];

      const event: ServiceIntegrationEvent = {
        type: 'service.updated',
        serviceId: SERVICE_ID,
        components: newComponents,
        updatedAt: LATER,
      };

      const result = serviceListingProject(state, event);

      expect(result).toEqual({
        serviceId: SERVICE_ID,
        components: newComponents,
        publishedAt: NOW,
        updatedAt: LATER,
      });
    });

    it('выбрасывает ошибку если state = null', () => {
      const event: ServiceIntegrationEvent = {
        type: 'service.updated',
        serviceId: SERVICE_ID,
        components: [],
        updatedAt: LATER,
      };

      expect(() => serviceListingProject(null, event)).toThrow('State is required');
    });
  });

  describe('service.unpublished', () => {
    it('возвращает null (удаление)', () => {
      const state = makeListing();
      const event: ServiceIntegrationEvent = {
        type: 'service.unpublished',
        serviceId: SERVICE_ID,
        unpublishedAt: LATER,
      };

      const result = serviceListingProject(state, event);

      expect(result).toBeNull();
    });
  });
});
