import { randomUUID } from 'node:crypto';

import { type E2eApp } from '../helpers/create-app.js';
import type { WidgetType } from '@/kernel/domain/vo/widget.js';

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
    availableWidgetTypes: WidgetType[];
    requiredWidgetTypes: WidgetType[];
  }> = {},
) {
  const res = await agent
    .post('/cms/item-types')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      id: overrides.id ?? randomUUID(),
      name: overrides.name ?? 'Test Type',
      availableWidgetTypes: overrides.availableWidgetTypes ?? [
        'base-info',
        'location',
        'payment',
        'category',
        'age-group',
        'owner',
      ],
      requiredWidgetTypes: overrides.requiredWidgetTypes ?? ['base-info'],
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
    { type: 'base-info', title: 'Test Item', description: 'Test item description', imageId: null },
  ];

  const res = await agent
    .post(`/organizations/${orgId}/items`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ typeId, widgets })
    .expect(201);

  return res.body;
}
