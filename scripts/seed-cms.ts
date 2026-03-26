import { config } from '@dotenvx/dotenvx';
import createClient from 'openapi-fetch';

import type { paths } from '../src/infra/contracts/generated-public-schema.js';
import { ADMIN_PHONE } from './seeds.js';

config({ convention: 'nextjs' });

// --- Typed API client ---

function createApi(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}

type Api = ReturnType<typeof createApi>;

async function loginAdmin(api: Api, otpCode: string): Promise<string> {
  const phone = `+${ADMIN_PHONE}`;

  await api.POST('/auth/request-otp', { body: { phoneNumber: phone } });
  const { data } = await api.POST('/auth/verify-otp', {
    body: { phoneNumber: phone, code: otpCode },
  });

  if (!data || data.type !== 'authenticated') {
    throw new Error(`Admin login failed: ${JSON.stringify(data)}`);
  }

  return data.accessToken;
}

function createAuthedApi(baseUrl: string, token: string) {
  return createClient<paths>({
    baseUrl,
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function uploadIcon(api: Api): Promise<string> {
  const { data: uploadReq } = await api.POST('/media/image/upload-request', {
    body: { name: 'seed-icon.png', mimeType: 'image/png' },
  });
  if (!uploadReq) throw new Error('Failed to request icon upload');

  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );

  const form = new FormData();
  for (const [key, value] of Object.entries(uploadReq.uploadFields)) {
    form.append(key, value);
  }
  form.append('file', new Blob([pngBytes], { type: 'image/png' }), 'seed-icon.png');

  const uploadRes = await fetch(uploadReq.uploadUrl, { method: 'POST', body: form });
  if (!uploadRes.ok && uploadRes.status !== 204) {
    throw new Error(`Icon upload failed: ${uploadRes.status}`);
  }

  await api.POST('/media/image/upload-complete', { body: { mediaId: uploadReq.fileId } });

  return uploadReq.fileId;
}

// --- Seed data ---

const ITEM_TYPE_SERVICE_ID = '00000000-0000-0000-0000-000000000001';
const ITEM_TYPE_EVENT_ID = '00000000-0000-0000-0000-000000000002';

const ITEM_TYPES = [
  {
    id: ITEM_TYPE_SERVICE_ID,
    name: 'Услуга',
    label: 'услугу',
    widgetSettings: [
      { type: 'base-info' as const, required: true },
      { type: 'category' as const, required: true },
      { type: 'owner' as const, required: true },
      { type: 'age-group' as const, required: false },
      { type: 'location' as const, required: false },
      { type: 'payment' as const, required: true, allowedStrategies: ['free' as const, 'one-time' as const, 'subscription' as const] },
      { type: 'schedule' as const, required: false },
      { type: 'contact-info' as const, required: false },
      { type: 'team' as const, required: false },
    ],
  },
  {
    id: ITEM_TYPE_EVENT_ID,
    name: 'Мероприятие',
    label: 'мероприятие',
    widgetSettings: [
      { type: 'base-info' as const, required: true },
      { type: 'category' as const, required: true },
      { type: 'owner' as const, required: true },
      { type: 'age-group' as const, required: true },
      { type: 'location' as const, required: true },
      { type: 'payment' as const, required: true, allowedStrategies: ['free' as const, 'one-time' as const] },
      { type: 'event-date-time' as const, required: true, maxDates: null },
      { type: 'contact-info' as const, required: false },
      { type: 'team' as const, required: false },
    ],
  },
];

const CATEGORIES = [
  {
    id: '00000000-0000-0000-0001-000000000001',
    name: 'Образование',
    allowedTypeIds: [ITEM_TYPE_SERVICE_ID, ITEM_TYPE_EVENT_ID],
    ageGroups: ['children' as const, 'adults' as const],
  },
  {
    id: '00000000-0000-0000-0001-000000000002',
    name: 'Спорт',
    allowedTypeIds: [ITEM_TYPE_SERVICE_ID, ITEM_TYPE_EVENT_ID],
    ageGroups: ['children' as const, 'adults' as const],
  },
  {
    id: '00000000-0000-0000-0001-000000000003',
    name: 'Творчество',
    allowedTypeIds: [ITEM_TYPE_SERVICE_ID],
    ageGroups: ['children' as const, 'adults' as const],
  },
  {
    id: '00000000-0000-0000-0001-000000000004',
    name: 'Развлечения',
    allowedTypeIds: [ITEM_TYPE_EVENT_ID],
    ageGroups: ['children' as const, 'adults' as const],
  },
];

const USERS = [
  { phone: '+79990000010', fullName: 'Алексей Петров', cityId: 'arkhangelsk' },
  { phone: '+79990000011', fullName: 'Мария Иванова', cityId: 'arkhangelsk' },
  { phone: '+79990000012', fullName: 'Дмитрий Козлов', cityId: 'arkhangelsk' },
  { phone: '+79990000013', fullName: 'Екатерина Смирнова', cityId: 'moscow' },
  { phone: '+79990000014', fullName: 'Андрей Волков', cityId: 'spb' },
];

const ORGANIZATIONS = [
  {
    name: 'Студия йоги «Прана»',
    description: 'Уютное пространство для практик йоги и медитации в центре города.',
  },
  {
    name: 'Школа танцев «Ритм»',
    description: 'Профессиональная школа танцев для детей и взрослых. Более 10 направлений.',
  },
  {
    name: 'Кофейня «Зерно»',
    description: 'Авторские напитки, свежая выпечка и уютная атмосфера каждый день.',
  },
];

const ITEMS = [
  {
    orgIndex: 0,
    typeId: ITEM_TYPE_SERVICE_ID,
    categoryId: CATEGORIES[0].id,
    title: 'Персональное занятие по йоге',
    description: 'Индивидуальная практика с опытным инструктором. Подходит для любого уровня подготовки.',
  },
  {
    orgIndex: 0,
    typeId: ITEM_TYPE_SERVICE_ID,
    categoryId: CATEGORIES[1].id,
    title: 'Абонемент на месяц',
    description: 'Безлимитное посещение групповых занятий в течение 30 дней.',
  },
  {
    orgIndex: 1,
    typeId: ITEM_TYPE_SERVICE_ID,
    categoryId: CATEGORIES[1].id,
    title: 'Групповое занятие по сальсе',
    description: 'Зажигательные танцы в дружной компании. Партнёр не требуется.',
  },
  {
    orgIndex: 1,
    typeId: ITEM_TYPE_EVENT_ID,
    categoryId: CATEGORIES[3].id,
    title: 'Танцевальный вечер',
    description: 'Открытый вечер социальных танцев — бачата, сальса, кизомба.',
  },
  {
    orgIndex: 2,
    typeId: ITEM_TYPE_EVENT_ID,
    categoryId: CATEGORIES[2].id,
    title: 'Мастер-класс по латте-арту',
    description: 'Научитесь рисовать на кофе под руководством нашего бариста.',
  },
];

// --- Main ---

export async function seedCms(baseUrl: string, otpCode: string) {
  // Wait for Kafka consumers to be ready before seeding
  await fetch(`${baseUrl}/test/wait-consumers`, { method: 'POST' });
  console.log('  → Consumers ready');

  const publicApi = createApi(baseUrl);
  const token = await loginAdmin(publicApi, otpCode);
  const api = createAuthedApi(baseUrl, token);

  // Users
  for (const user of USERS) {
    await publicApi.POST('/auth/request-otp', { body: { phoneNumber: user.phone } });
    const { data: verifyData } = await publicApi.POST('/auth/verify-otp', {
      body: { phoneNumber: user.phone, code: otpCode },
    });
    if (!verifyData || verifyData.type !== 'new_registration') {
      throw new Error(`User registration failed for ${user.fullName}: ${JSON.stringify(verifyData)}`);
    }
    await publicApi.POST('/auth/complete-profile', {
      body: {
        registrationSessionId: verifyData.registrationSessionId,
        fullName: user.fullName,
        cityId: user.cityId,
      },
    });
    console.log(`  → User: ${user.fullName}`);
  }

  // Item types
  for (const itemType of ITEM_TYPES) {
    await api.POST('/cms/item-types', { body: itemType });
    console.log(`  → Item type: ${itemType.name}`);
  }

  // Categories
  for (const cat of CATEGORIES) {
    const iconId = await uploadIcon(api);
    await api.POST('/cms/categories', {
      body: { ...cat, iconId, order: 0 },
    });
    console.log(`  → Category: ${cat.name}`);
  }

  // Publish categories
  for (const cat of CATEGORIES) {
    await api.POST('/cms/categories/{id}/publish', { params: { path: { id: cat.id } } });
  }
  console.log('  → Categories published');

  // Organizations
  const orgIds: string[] = [];
  for (const org of ORGANIZATIONS) {
    const avatarId = await uploadIcon(api);
    const { data } = await api.POST('/admin/organizations', {
      body: { name: org.name, description: org.description, avatarId, media: [], contacts: [] },
    });
    if (!data) throw new Error(`Failed to create org: ${org.name}`);
    orgIds.push(data.id);
    console.log(`  → Org: ${org.name}`);
  }

  // Publish organizations (submit + approve)
  for (const orgId of orgIds) {
    await api.POST('/organizations/{id}/submit-for-moderation', { params: { path: { id: orgId } } });
    await api.POST('/organizations/{id}/approve-moderation', { params: { path: { id: orgId } } });
  }
  console.log('  → Organizations published');

  // Items
  const createdItemIds: { orgId: string; itemId: string }[] = [];
  for (const item of ITEMS) {
    const orgId = orgIds[item.orgIndex];
    const widgets = buildItemWidgets(item);

    const { data, error } = await api.POST('/admin/organizations/{orgId}/items', {
      params: { path: { orgId } },
      body: { typeId: item.typeId, widgets },
    });
    if (!data) throw new Error(`Failed to create item "${item.title}": ${JSON.stringify(error)}`);
    createdItemIds.push({ orgId, itemId: data.itemId });
    console.log(`  → Item: ${item.title}`);
  }

  // Publish items (submit + approve)
  for (const { orgId, itemId } of createdItemIds) {
    await api.POST('/organizations/{orgId}/items/{itemId}/submit-for-moderation', {
      params: { path: { orgId, itemId } },
    });
    await api.POST('/organizations/{orgId}/items/{itemId}/approve-moderation', {
      params: { path: { orgId, itemId } },
    });
  }
  console.log('  → Items published');

  // Flush outbox → Kafka so consumers process all events
  await fetch(`${baseUrl}/test/flush-outbox`, { method: 'POST' });
  console.log('  → Outbox flushed');
}

type ItemWidgetInput = paths['/admin/organizations/{orgId}/items']['post']['requestBody']['content']['application/json']['widgets'][number];

function buildItemWidgets(item: (typeof ITEMS)[number]): ItemWidgetInput[] {
  const widgets: ItemWidgetInput[] = [
    { type: 'base-info', title: item.title, description: item.description, media: [] },
    { type: 'category', categoryIds: [item.categoryId], attributes: [] },
  ];

  if (item.typeId === ITEM_TYPE_EVENT_ID) {
    widgets.push({ type: 'age-group', value: 'all' });
    widgets.push({ type: 'location', cityId: 'arkhangelsk', lat: 64.5399, lng: 40.5152, address: null });
    widgets.push({
      type: 'payment',
      options: [{ name: 'Вход', description: null, strategy: 'free', price: null }],
    });
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    widgets.push({ type: 'event-date-time', dates: [{ date: nextWeek }] });
  } else {
    widgets.push({
      type: 'payment',
      options: [{ name: 'Разовое посещение', description: null, strategy: 'one-time', price: 1500 }],
    });
  }

  return widgets;
}

// --- CLI entry point ---
if (process.argv[1]?.endsWith('seed-cms.ts') || process.argv[1]?.endsWith('seed-cms.js')) {
  const apiUrl = process.env['API_URL'] ?? 'http://localhost:3012';
  const otpCode = process.env['TEST_OTP_CODE'] ?? '123456';

  seedCms(apiUrl, otpCode)
    .then(() => console.log('✓ CMS seed complete'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
