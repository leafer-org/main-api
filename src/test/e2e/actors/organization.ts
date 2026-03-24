import { randomUUID } from 'node:crypto';

import { type E2eApp } from '../helpers/create-app.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';

export async function createOrganization(
  agent: E2eApp['agent'],
  accessToken: string,
  overrides: Partial<{ name: string; description: string; avatarId: string | null }> = {},
) {
  const res = await agent
    .post('/organizations')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name: overrides.name ?? 'Test Organization',
      description: overrides.description ?? 'Test Description',
      avatarId: overrides.avatarId ?? null,
    })
    .expect(201);

  return res.body;
}

export async function createItemType(
  agent: E2eApp['agent'],
  adminToken: string,
  overrides: Partial<{
    id: string;
    name: string;
    label: string;
    widgetSettings: WidgetSettings[];
  }> = {},
) {
  const res = await agent
    .post('/cms/item-types')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      id: overrides.id ?? randomUUID(),
      name: overrides.name ?? 'Test Type',
      label: overrides.label ?? 'тестовый тип',
      widgetSettings: overrides.widgetSettings ?? [
        { type: 'base-info', required: true },
        { type: 'location', required: false },
        { type: 'payment', required: false, allowedStrategies: ['free', 'one-time', 'subscription'] },
        { type: 'category', required: false },
        { type: 'age-group', required: false },
        { type: 'owner', required: false },
      ],
    })
    .expect(201);

  return res.body;
}

export async function createItem(
  agent: E2eApp['agent'],
  accessToken: string,
  orgId: string,
  typeId: string,
  overrides: Partial<{ widgets: unknown[] }> = {},
) {
  const widgets = overrides.widgets ?? [
    { type: 'base-info', title: 'Test Item', description: 'Test item description', media: [] },
  ];

  const res = await agent
    .post(`/organizations/${orgId}/items`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ typeId, widgets })
    .expect(201);

  return res.body;
}
