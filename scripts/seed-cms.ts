import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { config } from '@dotenvx/dotenvx';
import createClient from 'openapi-fetch';

import type { paths } from '../src/infra/contracts/generated-public-schema.js';
import { ADMIN_PHONE } from './seeds.js';

const FIXTURES_DIR = join(import.meta.dirname!, 'fixtures');

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

async function uploadImage(api: Api, fixturePath: string): Promise<string> {
  const filePath = join(FIXTURES_DIR, fixturePath);
  const bytes = readFileSync(filePath);
  const name = fixturePath.split('/').pop()!;

  const { data: uploadReq } = await api.POST('/media/image/upload-request', {
    body: { name, mimeType: 'image/jpeg' },
  });
  if (!uploadReq) throw new Error(`Failed to request upload for ${fixturePath}`);

  const form = new FormData();
  for (const [key, value] of Object.entries(uploadReq.uploadFields)) {
    form.append(key, value);
  }
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), name);

  const uploadRes = await fetch(uploadReq.uploadUrl, { method: 'POST', body: form });
  if (!uploadRes.ok && uploadRes.status !== 204) {
    throw new Error(`Upload failed for ${fixturePath}: ${uploadRes.status}`);
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
    fixture: 'categories/education.jpg',
  },
  {
    id: '00000000-0000-0000-0001-000000000002',
    name: 'Спорт',
    allowedTypeIds: [ITEM_TYPE_SERVICE_ID, ITEM_TYPE_EVENT_ID],
    ageGroups: ['children' as const, 'adults' as const],
    fixture: 'categories/sport.jpg',
  },
  {
    id: '00000000-0000-0000-0001-000000000003',
    name: 'Творчество',
    allowedTypeIds: [ITEM_TYPE_SERVICE_ID],
    ageGroups: ['children' as const, 'adults' as const],
    fixture: 'categories/creativity.jpg',
  },
  {
    id: '00000000-0000-0000-0001-000000000004',
    name: 'Развлечения',
    allowedTypeIds: [ITEM_TYPE_EVENT_ID],
    ageGroups: ['children' as const, 'adults' as const],
    fixture: 'categories/entertainment.jpg',
  },
];

// All users in Arkhangelsk, spread across different districts for geo-recommendation testing
const USERS = [
  { phone: '+79990000010', fullName: 'Алексей Петров', cityId: 'arkhangelsk', lat: 64.5399, lng: 40.5152 },   // Центр
  { phone: '+79990000011', fullName: 'Мария Иванова', cityId: 'arkhangelsk', lat: 64.5600, lng: 40.4800 },    // Соломбала (север)
  { phone: '+79990000012', fullName: 'Дмитрий Козлов', cityId: 'arkhangelsk', lat: 64.5200, lng: 40.5800 },   // Майская горка (юго-восток)
  { phone: '+79990000013', fullName: 'Екатерина Смирнова', cityId: 'arkhangelsk', lat: 64.5500, lng: 40.4200 }, // Левый берег (запад)
  { phone: '+79990000014', fullName: 'Андрей Волков', cityId: 'arkhangelsk', lat: 64.5100, lng: 40.5500 },     // Варавино (юг)
];

const ORGANIZATIONS = [
  {
    name: 'Студия йоги «Прана»',
    description: 'Уютное пространство для практик йоги и медитации в центре города.',
    fixture: 'orgs/yoga-studio.jpg',
  },
  {
    name: 'Школа танцев «Ритм»',
    description: 'Профессиональная школа танцев для детей и взрослых. Более 10 направлений.',
    fixture: 'orgs/dance-school.jpg',
  },
  {
    name: 'Кофейня «Зерно»',
    description: 'Авторские напитки, свежая выпечка и уютная атмосфера каждый день.',
    fixture: 'orgs/coffee-shop.jpg',
  },
];

// Items spread across Arkhangelsk districts with diverse widgets
const ITEMS: ItemSeed[] = [
  // --- Org 0: Студия йоги «Прана» — Центр ---
  {
    orgIndex: 0,
    typeId: ITEM_TYPE_SERVICE_ID,
    categoryId: CATEGORIES[0].id, // Образование
    title: 'Персональное занятие по йоге',
    description: 'Индивидуальная практика с опытным инструктором. Подходит для любого уровня подготовки.',
    fixture: 'items/personal-yoga.jpg',
    location: { cityId: 'arkhangelsk', lat: 64.5405, lng: 40.5130, address: 'ул. Чумбарова-Лучинского, 10' },
    ageGroup: 'adults',
    payment: [
      { name: 'Разовое посещение', description: null, strategy: 'one-time', price: 1500 },
      { name: 'Абонемент 8 занятий', description: 'Действует 30 дней', strategy: 'subscription', price: 8000 },
    ],
    schedule: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '10:30' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '10:30' },
      { dayOfWeek: 5, startTime: '18:00', endTime: '19:30' },
    ],
    contacts: [
      { type: 'phone', value: '+79001234501', label: 'Запись' },
      { type: 'email', value: 'prana@example.com' },
    ],
  },
  {
    orgIndex: 0,
    typeId: ITEM_TYPE_SERVICE_ID,
    categoryId: CATEGORIES[1].id, // Спорт
    title: 'Групповая хатха-йога',
    description: 'Мягкая практика для начинающих. Работа с дыханием, растяжкой и балансом.',
    fixture: 'items/group-hatha.jpg',
    location: { cityId: 'arkhangelsk', lat: 64.5405, lng: 40.5130, address: 'ул. Чумбарова-Лучинского, 10' },
    ageGroup: 'all',
    payment: [
      { name: 'Бесплатное пробное', description: 'Первое занятие бесплатно', strategy: 'free', price: null },
      { name: 'Разовое', description: null, strategy: 'one-time', price: 800 },
    ],
    schedule: [
      { dayOfWeek: 2, startTime: '19:00', endTime: '20:30' },
      { dayOfWeek: 4, startTime: '19:00', endTime: '20:30' },
      { dayOfWeek: 6, startTime: '11:00', endTime: '12:30' },
    ],
    team: {
      title: 'Инструкторы',
      members: [
        { name: 'Ольга Сидорова', description: 'Сертифицированный инструктор, 8 лет опыта', fixture: 'team/olga.jpg' },
      ],
    },
  },
  // --- Org 1: Школа танцев «Ритм» — Соломбала (север) ---
  {
    orgIndex: 1,
    typeId: ITEM_TYPE_SERVICE_ID,
    categoryId: CATEGORIES[1].id, // Спорт
    title: 'Групповое занятие по сальсе',
    description: 'Зажигательные танцы в дружной компании. Партнёр не требуется.',
    fixture: 'items/salsa-class.jpg',
    location: { cityId: 'arkhangelsk', lat: 64.5610, lng: 40.4750, address: 'ул. Кедрова, 22' },
    ageGroup: 'adults',
    payment: [
      { name: 'Разовое посещение', description: null, strategy: 'one-time', price: 600 },
    ],
    schedule: [
      { dayOfWeek: 1, startTime: '19:00', endTime: '20:30' },
      { dayOfWeek: 3, startTime: '19:00', endTime: '20:30' },
    ],
    contacts: [
      { type: 'phone', value: '+79001234502' },
      { type: 'link', value: 'https://example.com/ritm', label: 'Сайт' },
    ],
  },
  {
    orgIndex: 1,
    typeId: ITEM_TYPE_SERVICE_ID,
    categoryId: CATEGORIES[0].id, // Образование
    title: 'Танцы для детей 5–10 лет',
    description: 'Развитие координации, чувства ритма и пластики через игровые танцевальные занятия.',
    fixture: 'items/kids-dance.jpg',
    location: { cityId: 'arkhangelsk', lat: 64.5610, lng: 40.4750, address: 'ул. Кедрова, 22' },
    ageGroup: 'children',
    payment: [
      { name: 'Абонемент на месяц', description: '8 занятий', strategy: 'subscription', price: 4000 },
    ],
    schedule: [
      { dayOfWeek: 2, startTime: '16:00', endTime: '17:00' },
      { dayOfWeek: 4, startTime: '16:00', endTime: '17:00' },
      { dayOfWeek: 6, startTime: '10:00', endTime: '11:00' },
    ],
    team: {
      title: 'Преподаватели',
      members: [
        { name: 'Анна Белова', description: 'Педагог-хореограф, работает с детьми 12 лет', fixture: 'team/anna.jpg' },
        { name: 'Игорь Морозов', description: 'Мастер спорта по бальным танцам', fixture: 'team/igor.jpg' },
      ],
    },
  },
  {
    orgIndex: 1,
    typeId: ITEM_TYPE_EVENT_ID,
    categoryId: CATEGORIES[3].id, // Развлечения
    title: 'Танцевальный вечер',
    description: 'Открытый вечер социальных танцев — бачата, сальса, кизомба.',
    fixture: 'items/dance-evening.jpg',
    location: { cityId: 'arkhangelsk', lat: 64.5580, lng: 40.4830, address: 'пр. Никольский, 40' },
    ageGroup: 'adults',
    payment: [
      { name: 'Вход', description: null, strategy: 'free', price: null },
    ],
    eventDaysFromNow: [7, 14, 21],
    contacts: [
      { type: 'phone', value: '+79001234502' },
    ],
  },
  // --- Org 2: Кофейня «Зерно» — Майская горка (юго-восток) ---
  {
    orgIndex: 2,
    typeId: ITEM_TYPE_EVENT_ID,
    categoryId: CATEGORIES[0].id, // Образование (Творчество не допускает Event)
    title: 'Мастер-класс по латте-арту',
    description: 'Научитесь рисовать на кофе под руководством нашего бариста.',
    fixture: 'items/latte-art.jpg',
    location: { cityId: 'arkhangelsk', lat: 64.5180, lng: 40.5850, address: 'ул. Галушина, 15' },
    ageGroup: 'all',
    payment: [
      { name: 'Участие', description: 'Включая кофе и десерт', strategy: 'one-time', price: 1200 },
    ],
    eventDaysFromNow: [5, 12],
    team: {
      title: 'Ведущие',
      members: [
        { name: 'Виктор Чернов', description: 'Шеф-бариста, призёр чемпионата по латте-арту', fixture: 'team/viktor.jpg' },
      ],
    },
  },
  {
    orgIndex: 2,
    typeId: ITEM_TYPE_SERVICE_ID,
    categoryId: CATEGORIES[2].id, // Творчество
    title: 'Кофейная дегустация',
    description: 'Попробуйте 5 сортов кофе из разных стран и узнайте разницу между способами обработки.',
    fixture: 'items/coffee-tasting.jpg',
    location: { cityId: 'arkhangelsk', lat: 64.5180, lng: 40.5850, address: 'ул. Галушина, 15' },
    ageGroup: 'adults',
    payment: [
      { name: 'Участие', description: null, strategy: 'one-time', price: 900 },
    ],
    schedule: [
      { dayOfWeek: 6, startTime: '14:00', endTime: '16:00' },
      { dayOfWeek: 7, startTime: '14:00', endTime: '16:00' },
    ],
    contacts: [
      { type: 'phone', value: '+79001234503', label: 'Бронирование' },
      { type: 'link', value: 'https://example.com/zerno', label: 'Инстаграм' },
    ],
  },
  {
    orgIndex: 2,
    typeId: ITEM_TYPE_EVENT_ID,
    categoryId: CATEGORIES[3].id, // Развлечения
    title: 'Поэтический вечер',
    description: 'Открытый микрофон для поэтов и слушателей. Тёплая атмосфера и живая музыка.',
    fixture: 'items/poetry-evening.jpg',
    location: { cityId: 'arkhangelsk', lat: 64.5220, lng: 40.5750, address: 'ул. Галушина, 15' },
    ageGroup: 'adults',
    payment: [
      { name: 'Вход свободный', description: null, strategy: 'free', price: null },
    ],
    eventDaysFromNow: [3],
    contacts: [
      { type: 'email', value: 'zerno.events@example.com', label: 'Заявка на выступление' },
    ],
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
        lat: user.lat,
        lng: user.lng,
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
    const iconId = await uploadImage(api, cat.fixture);
    await api.POST('/cms/categories', {
      body: { id: cat.id, name: cat.name, allowedTypeIds: cat.allowedTypeIds, ageGroups: cat.ageGroups, iconId, order: 0 },
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
    const avatarId = await uploadImage(api, org.fixture);
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

    // Upload item cover image
    const coverMediaId = await uploadImage(api, item.fixture);

    // Upload team member photos
    const teamMemberMediaIds: Map<string, string> = new Map();
    if (item.team) {
      for (const member of item.team.members) {
        if (member.fixture) {
          const mediaId = await uploadImage(api, member.fixture);
          teamMemberMediaIds.set(member.fixture, mediaId);
        }
      }
    }

    const widgets = buildItemWidgets(item, coverMediaId, teamMemberMediaIds);

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

  await fetch(`${baseUrl}/test/wait-consumers`, { method: 'POST' });
  console.log('  → Consumers processed');

  await new Promise((r) => setTimeout(r, 2000));
  console.log('  → Settled');
}

type ItemWidgetInput = paths['/admin/organizations/{orgId}/items']['post']['requestBody']['content']['application/json']['widgets'][number];

interface ItemSeed {
  orgIndex: number;
  typeId: string;
  categoryId: string;
  title: string;
  description: string;
  fixture: string;
  location?: { cityId: string; lat: number; lng: number; address: string | null };
  ageGroup?: 'children' | 'adults' | 'all';
  payment: { name: string; description: string | null; strategy: 'free' | 'one-time' | 'subscription'; price: number | null }[];
  schedule?: { dayOfWeek: number; startTime: string; endTime: string }[];
  contacts?: { type: 'phone' | 'email' | 'link'; value: string; label?: string }[];
  team?: { title: string; members: { name: string; description?: string; fixture?: string }[] };
  eventDaysFromNow?: number[];
}

function buildItemWidgets(item: ItemSeed, coverMediaId: string, teamMediaIds: Map<string, string>): ItemWidgetInput[] {
  const widgets: ItemWidgetInput[] = [
    { type: 'base-info', title: item.title, description: item.description, media: [{ type: 'image', mediaId: coverMediaId }] },
    { type: 'category', categoryIds: [item.categoryId], attributes: [] },
    { type: 'payment', options: item.payment },
  ];

  if (item.ageGroup) {
    widgets.push({ type: 'age-group', value: item.ageGroup });
  }

  if (item.location) {
    widgets.push({ type: 'location', ...item.location });
  }

  if (item.schedule) {
    widgets.push({ type: 'schedule', entries: item.schedule });
  }

  if (item.contacts) {
    widgets.push({ type: 'contact-info', contacts: item.contacts });
  }

  if (item.team) {
    const members = item.team.members.map((m) => ({
      name: m.name,
      description: m.description,
      media: m.fixture && teamMediaIds.has(m.fixture)
        ? [{ type: 'image' as const, mediaId: teamMediaIds.get(m.fixture)! }]
        : [],
    }));
    widgets.push({ type: 'team', title: item.team.title, members });
  }

  if (item.eventDaysFromNow) {
    const dates = item.eventDaysFromNow.map((days) => ({
      date: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
    }));
    widgets.push({ type: 'event-date-time', dates });
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
