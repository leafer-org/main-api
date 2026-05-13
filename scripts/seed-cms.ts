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
const ITEM_TYPE_FULL_ID = '00000000-0000-0000-0000-000000000003';

const ITEM_TYPES = [
  {
    id: ITEM_TYPE_SERVICE_ID,
    name: 'Услуга',
    label: 'услугу',
    widgetSettings: [
      { type: 'base-info' as const, required: true },
      { type: 'category' as const, required: true },
      { type: 'owner' as const, required: true },
      { type: 'age-group' as const, required: false, showOnCard: true },
      { type: 'location' as const, required: false },
      { type: 'payment' as const, required: true, allowedStrategies: ['free' as const, 'one-time' as const, 'subscription' as const] },
      { type: 'schedule' as const, required: false, showOnCard: true },
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
      { type: 'age-group' as const, required: true, showOnCard: true },
      { type: 'location' as const, required: true },
      { type: 'payment' as const, required: true, allowedStrategies: ['free' as const, 'one-time' as const] },
      { type: 'event-date-time' as const, required: true, maxDates: null, showOnCard: true },
      { type: 'contact-info' as const, required: false },
      { type: 'team' as const, required: false },
    ],
  },
  {
    // Универсальный тип «Активность» — фикстура для тестирования любых виджетов:
    // card-enrichment, item-detail, фильтры, рендер team/contacts/payment-стратегий.
    // Все виджеты включены, все card-toggleable showOnCard=true.
    id: ITEM_TYPE_FULL_ID,
    name: 'Активность',
    label: 'активность',
    widgetSettings: [
      { type: 'base-info' as const, required: true },
      { type: 'category' as const, required: true },
      { type: 'owner' as const, required: true },
      { type: 'age-group' as const, required: true, showOnCard: true },
      { type: 'location' as const, required: true },
      { type: 'payment' as const, required: true, allowedStrategies: ['free' as const, 'one-time' as const, 'subscription' as const] },
      { type: 'item-review' as const, required: false },
      { type: 'owner-review' as const, required: false },
      { type: 'event-date-time' as const, required: false, maxDates: null, showOnCard: true },
      { type: 'schedule' as const, required: false, showOnCard: true },
      { type: 'contact-info' as const, required: false },
      { type: 'team' as const, required: false },
    ],
  },
];

const CAT_EDUCATION_ID = '00000000-0000-0000-0001-000000000001';
const CAT_SPORT_ID = '00000000-0000-0000-0001-000000000002';
const CAT_CREATIVITY_ID = '00000000-0000-0000-0001-000000000003';
const CAT_ENTERTAINMENT_ID = '00000000-0000-0000-0001-000000000004';
const CAT_YOGA_ID = '00000000-0000-0000-0001-000000000005';

const CATEGORIES = [
  {
    id: CAT_EDUCATION_ID,
    parentCategoryId: null as string | null,
    name: 'Образование',
    allowedTypeIds: [ITEM_TYPE_SERVICE_ID, ITEM_TYPE_EVENT_ID, ITEM_TYPE_FULL_ID],
    ageGroups: ['children' as const, 'adults' as const],
    fixture: 'categories/education.jpg',
  },
  {
    id: CAT_SPORT_ID,
    parentCategoryId: null as string | null,
    name: 'Спорт',
    allowedTypeIds: [ITEM_TYPE_SERVICE_ID, ITEM_TYPE_EVENT_ID, ITEM_TYPE_FULL_ID],
    ageGroups: ['children' as const, 'adults' as const],
    fixture: 'categories/sport.jpg',
  },
  {
    id: CAT_CREATIVITY_ID,
    parentCategoryId: null as string | null,
    name: 'Творчество',
    allowedTypeIds: [ITEM_TYPE_SERVICE_ID, ITEM_TYPE_FULL_ID],
    ageGroups: ['children' as const, 'adults' as const],
    fixture: 'categories/creativity.jpg',
  },
  {
    id: CAT_ENTERTAINMENT_ID,
    parentCategoryId: null as string | null,
    name: 'Развлечения',
    allowedTypeIds: [ITEM_TYPE_EVENT_ID, ITEM_TYPE_FULL_ID],
    ageGroups: ['children' as const, 'adults' as const],
    fixture: 'categories/entertainment.jpg',
  },
  {
    id: CAT_YOGA_ID,
    parentCategoryId: CAT_SPORT_ID,
    name: 'Йога',
    allowedTypeIds: [ITEM_TYPE_SERVICE_ID, ITEM_TYPE_EVENT_ID, ITEM_TYPE_FULL_ID],
    ageGroups: ['children' as const, 'adults' as const],
    fixture: 'categories/sport.jpg',
  },
];

// Attributes — assigned BEFORE publish so they propagate to ancestors/items via published event.
const ATTR_LEVEL_ID = '00000000-0000-0000-0002-000000000001';
const ATTR_STYLE_ID = '00000000-0000-0000-0002-000000000002';

const CATEGORY_ATTRIBUTES = [
  {
    categoryId: CAT_SPORT_ID,
    attributeId: ATTR_LEVEL_ID,
    name: 'Уровень',
    required: true,
    schema: { type: 'enum' as const, options: ['Начинающий', 'Средний', 'Продвинутый'] },
  },
  {
    categoryId: CAT_YOGA_ID,
    attributeId: ATTR_STYLE_ID,
    name: 'Стиль',
    required: true,
    schema: { type: 'enum' as const, options: ['Хатха', 'Виньяса', 'Инь', 'Аштанга'] },
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
    categoryId: CAT_EDUCATION_ID,
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
    categoryId: CAT_SPORT_ID,
    attributes: [{ attributeId: ATTR_LEVEL_ID, value: 'Начинающий' }],
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
    categoryId: CAT_SPORT_ID,
    attributes: [{ attributeId: ATTR_LEVEL_ID, value: 'Начинающий' }],
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
    categoryId: CAT_EDUCATION_ID,
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
    categoryId: CAT_ENTERTAINMENT_ID,
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
    categoryId: CAT_EDUCATION_ID, // (Творчество не допускает Event)
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
    categoryId: CAT_CREATIVITY_ID,
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
    categoryId: CAT_ENTERTAINMENT_ID,
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
  // --- Bulk: Йога подкатегория, Архангельск, разные районы ---
  ...buildYogaItems(),

  // --- Bulk: «Активности» — фикстура для тестов любых виджетов ---
  // Разные комбинации: всё-сразу, только расписание, только события, разные ageGroup,
  // разные стратегии оплаты, длинные/короткие списки команды и контактов.
  ...buildFullActivityItems(),
];

// Generates ~30 items in the "Йога" subcategory across Arkhangelsk districts.
// Diversity не важна — нужны объёмы для тестирования каталога/поиска/ленты.
function buildYogaItems(): ItemSeed[] {
  const styles = ['Хатха', 'Виньяса', 'Инь', 'Аштанга'];
  const levels = ['Начинающий', 'Средний', 'Продвинутый'];
  const districts = [
    { lat: 64.5400, lng: 40.5150, address: 'ул. Поморская, 5' },        // Центр
    { lat: 64.5605, lng: 40.4790, address: 'ул. Никольская, 31' },       // Соломбала
    { lat: 64.5210, lng: 40.5820, address: 'ул. Галушина, 21' },         // Майская горка
    { lat: 64.5510, lng: 40.4220, address: 'ул. Лесная, 8' },            // Левый берег
    { lat: 64.5120, lng: 40.5510, address: 'ул. Воронина, 14' },         // Варавино
  ];
  const fixtures = ['items/personal-yoga.jpg', 'items/group-hatha.jpg'];

  const items: ItemSeed[] = [];
  for (let i = 0; i < 30; i++) {
    const style = styles[i % styles.length];
    const level = levels[i % levels.length];
    const district = districts[i % districts.length];
    const fixture = fixtures[i % fixtures.length];
    const orgIndex = i % 3;
    const isEvent = i % 7 === 0;

    const base: ItemSeed = {
      orgIndex,
      typeId: isEvent ? ITEM_TYPE_EVENT_ID : ITEM_TYPE_SERVICE_ID,
      categoryId: CAT_YOGA_ID,
      attributes: [
        { attributeId: ATTR_LEVEL_ID, value: level },
        { attributeId: ATTR_STYLE_ID, value: style },
      ],
      title: `${style}-йога #${i + 1} (${level})`,
      description: `Практика ${style.toLowerCase()}-йоги для уровня «${level.toLowerCase()}». Архангельск.`,
      fixture,
      location: { cityId: 'arkhangelsk', lat: district.lat, lng: district.lng, address: district.address },
      ageGroup: 'adults',
      payment: [
        { name: 'Разовое', description: null, strategy: 'one-time', price: 500 + (i % 5) * 200 },
      ],
    };

    if (isEvent) {
      base.eventDaysFromNow = [3 + (i % 14)];
    } else {
      base.schedule = [
        { dayOfWeek: 1 + (i % 6), startTime: '18:00', endTime: '19:30' },
      ];
    }

    items.push(base);
  }
  return items;
}

/**
 * «Активности» — универсальный тип-фикстура для тестирования любых виджетов:
 * card-enrichment, item-detail, фильтры, рендер team/contacts/payment-стратегий и т.д.
 *
 * Каждый item демонстрирует свою комбинацию виджетов, чтобы покрыть разные сценарии:
 *   - комплект всё-сразу (расписание+события+команда+контакты+три страт. оплаты)
 *   - только расписание (без событий)
 *   - только события (без расписания)
 *   - только free / только subscription / только one-time
 *   - разные ageGroup (adults / children / all)
 *   - с/без team, с/без contacts
 *   - длинная команда / много контактов / много дат
 */
function buildFullActivityItems(): ItemSeed[] {
  const D = {
    centre: { lat: 64.5402, lng: 40.5160, address: 'пр. Троицкий, 73' },
    solombala: { lat: 64.5598, lng: 40.4810, address: 'ул. Партизанская, 7' },
    mayskaya: { lat: 64.5215, lng: 40.5810, address: 'ул. Октябрят, 35' },
    levberezh: { lat: 64.5505, lng: 40.4250, address: 'ул. Мостостроителей, 4' },
    varavino: { lat: 64.5125, lng: 40.5530, address: 'ул. Стрелковая, 19' },
  };
  const loc = (d: { lat: number; lng: number; address: string }) => ({
    cityId: 'arkhangelsk',
    ...d,
  });

  return [
    // 0. Всё-сразу: events + schedule + team + contacts + 3 стратегии оплаты
    {
      orgIndex: 0,
      typeId: ITEM_TYPE_FULL_ID,
      categoryId: CAT_EDUCATION_ID,
      title: 'Школа единоборств: всё-в-одном',
      description: 'Регулярные тренировки + ивенты-турниры + бесплатное пробное.',
      fixture: 'items/group-hatha.jpg',
      location: loc(D.centre),
      ageGroup: 'all',
      payment: [
        { name: 'Бесплатное пробное', description: 'Первый визит', strategy: 'free', price: null },
        { name: 'Разовое', description: null, strategy: 'one-time', price: 800 },
        { name: 'Абонемент', description: '8 занятий, 30 дней', strategy: 'subscription', price: 5000 },
      ],
      schedule: [
        { dayOfWeek: 1, startTime: '18:00', endTime: '19:30' },
        { dayOfWeek: 3, startTime: '18:00', endTime: '19:30' },
        { dayOfWeek: 6, startTime: '11:00', endTime: '12:30' },
      ],
      eventDaysFromNow: [3, 10, 17],
      contacts: [
        { type: 'phone', value: '+79001231001', label: 'Запись' },
        { type: 'email', value: 'all-in@example.com' },
        { type: 'link', value: 'https://example.com/all-in', label: 'Сайт' },
      ],
      team: {
        title: 'Тренеры',
        members: [
          { name: 'Ольга Сидорова', description: 'Старший тренер', fixture: 'team/olga.jpg' },
          { name: 'Игорь Морозов', description: 'Тренер', fixture: 'team/igor.jpg' },
        ],
      },
    },

    // 1. Только расписание (повторяющаяся практика, нет событий)
    {
      orgIndex: 1,
      typeId: ITEM_TYPE_FULL_ID,
      categoryId: CAT_SPORT_ID,
      attributes: [{ attributeId: ATTR_LEVEL_ID, value: 'Средний' }],
      title: 'Бассейн: групповые заплывы',
      description: 'Только регулярные занятия — расписание стабильное круглый год.',
      fixture: 'items/personal-yoga.jpg',
      location: loc(D.solombala),
      ageGroup: 'adults',
      payment: [
        { name: 'Абонемент', description: '12 занятий', strategy: 'subscription', price: 6000 },
      ],
      schedule: [
        { dayOfWeek: 2, startTime: '07:00', endTime: '08:00' },
        { dayOfWeek: 4, startTime: '07:00', endTime: '08:00' },
        { dayOfWeek: 5, startTime: '20:00', endTime: '21:00' },
      ],
      contacts: [{ type: 'phone', value: '+79001231002' }],
    },

    // 2. Только события (фестиваль, разовая серия дат, без расписания)
    {
      orgIndex: 2,
      typeId: ITEM_TYPE_FULL_ID,
      categoryId: CAT_ENTERTAINMENT_ID,
      title: 'Фестиваль уличной еды',
      description: 'Серия фестивальных дней на набережной.',
      fixture: 'items/dance-evening.jpg',
      location: loc(D.centre),
      ageGroup: 'all',
      payment: [
        { name: 'Вход', description: null, strategy: 'free', price: null },
      ],
      eventDaysFromNow: [5, 12, 19, 26],
      team: {
        title: 'Организаторы',
        members: [
          { name: 'Виктор Чернов', description: 'Главный куратор', fixture: 'team/viktor.jpg' },
        ],
      },
    },

    // 3. Только бесплатно (free), для детей
    {
      orgIndex: 1,
      typeId: ITEM_TYPE_FULL_ID,
      categoryId: CAT_EDUCATION_ID,
      title: 'Детская площадка: открытые игры',
      description: 'Бесплатные игровые сессии для детей 5–10 лет.',
      fixture: 'items/kids-dance.jpg',
      location: loc(D.mayskaya),
      ageGroup: 'children',
      payment: [
        { name: 'Бесплатно', description: null, strategy: 'free', price: null },
      ],
      schedule: [
        { dayOfWeek: 6, startTime: '10:00', endTime: '12:00' },
        { dayOfWeek: 7, startTime: '10:00', endTime: '12:00' },
      ],
      contacts: [{ type: 'email', value: 'kids@example.com' }],
    },

    // 4. Только подписка (subscription), без событий и контактов
    {
      orgIndex: 0,
      typeId: ITEM_TYPE_FULL_ID,
      categoryId: CAT_CREATIVITY_ID,
      title: 'Клуб медитации: подписка',
      description: 'Доступ ко всем сессиям клуба по абонементу. Без разовых посещений.',
      fixture: 'items/personal-yoga.jpg',
      location: loc(D.levberezh),
      ageGroup: 'adults',
      payment: [
        { name: 'Месячный абонемент', description: 'Все сессии месяца', strategy: 'subscription', price: 4500 },
      ],
      schedule: [
        { dayOfWeek: 1, startTime: '20:00', endTime: '21:00' },
        { dayOfWeek: 4, startTime: '20:00', endTime: '21:00' },
      ],
    },

    // 5. Большая команда + много контактов + много дат — стресс-тест на длинные списки
    {
      orgIndex: 1,
      typeId: ITEM_TYPE_FULL_ID,
      categoryId: CAT_ENTERTAINMENT_ID,
      title: 'Городской квест: серия большая',
      description: 'Несколько туров, большая команда ведущих, разнообразные точки контакта.',
      fixture: 'items/dance-evening.jpg',
      location: loc(D.varavino),
      ageGroup: 'all',
      payment: [
        { name: 'Команда до 4 человек', description: null, strategy: 'one-time', price: 2400 },
        { name: 'Команда до 8 человек', description: null, strategy: 'one-time', price: 4000 },
      ],
      eventDaysFromNow: [2, 4, 6, 9, 13, 18, 25, 31],
      contacts: [
        { type: 'phone', value: '+79001231003', label: 'Запись' },
        { type: 'phone', value: '+79001231004', label: 'Поддержка' },
        { type: 'email', value: 'quest@example.com' },
        { type: 'email', value: 'quest-press@example.com', label: 'СМИ' },
        { type: 'link', value: 'https://example.com/quest', label: 'Сайт' },
        { type: 'link', value: 'https://t.me/quest', label: 'Telegram' },
      ],
      team: {
        title: 'Ведущие квеста',
        members: [
          { name: 'Ольга Сидорова', description: 'Главный мастер', fixture: 'team/olga.jpg' },
          { name: 'Анна Белова', description: 'Мастер', fixture: 'team/anna.jpg' },
          { name: 'Игорь Морозов', description: 'Помощник', fixture: 'team/igor.jpg' },
          { name: 'Виктор Чернов', description: 'Помощник', fixture: 'team/viktor.jpg' },
        ],
      },
    },

    // 6. Платно one-time, без team и contacts (минимум — проверка пустых блоков)
    {
      orgIndex: 2,
      typeId: ITEM_TYPE_FULL_ID,
      categoryId: CAT_CREATIVITY_ID,
      title: 'Лекция о современном искусстве',
      description: 'Одиночное событие без команды и публичных контактов.',
      fixture: 'items/coffee-tasting.jpg',
      location: loc(D.centre),
      ageGroup: 'adults',
      payment: [
        { name: 'Билет', description: null, strategy: 'one-time', price: 700 },
      ],
      eventDaysFromNow: [4],
    },

    // 7. Все виджеты + дорогая цена + длинное описание для текстовых тестов
    {
      orgIndex: 0,
      typeId: ITEM_TYPE_FULL_ID,
      categoryId: CAT_EDUCATION_ID,
      title: 'Интенсив: погружение в профессию (расширенная программа)',
      description:
        'Полный программный интенсив с теоретической базой, практикой, домашними заданиями ' +
        'и индивидуальным куратором. Включает доступ к закрытым материалам и пожизненной ' +
        'базе выпускников. Подходит для тех, кто хочет сменить специальность.',
      fixture: 'items/group-hatha.jpg',
      location: loc(D.solombala),
      ageGroup: 'adults',
      payment: [
        { name: 'Базовый', description: 'Без куратора', strategy: 'one-time', price: 35000 },
        { name: 'С куратором', description: 'Индивидуальная поддержка', strategy: 'one-time', price: 60000 },
        { name: 'Premium', description: 'Куратор + закрытые материалы', strategy: 'subscription', price: 12000 },
      ],
      schedule: [
        { dayOfWeek: 6, startTime: '10:00', endTime: '13:00' },
        { dayOfWeek: 7, startTime: '10:00', endTime: '13:00' },
      ],
      eventDaysFromNow: [14, 28, 42],
      contacts: [
        { type: 'phone', value: '+79001231005', label: 'Запись' },
        { type: 'email', value: 'intensive@example.com' },
      ],
      team: {
        title: 'Кураторы',
        members: [
          { name: 'Ольга Сидорова', description: 'Главный куратор', fixture: 'team/olga.jpg' },
          { name: 'Игорь Морозов', description: 'Преподаватель', fixture: 'team/igor.jpg' },
        ],
      },
    },
  ];
}

// --- Main ---

export async function seedCms(baseUrl: string, otpCode: string) {
  // Wait for Kafka consumers to be ready before seeding
  await fetch(`${baseUrl}/test/wait-consumers`, { method: 'POST' });
  console.log('  → Consumers ready');

  const publicApi = createApi(baseUrl);
  const token = await loginAdmin(publicApi, otpCode);
  const api = createAuthedApi(baseUrl, token);

  // Users — регистрация + повторный логин для получения accessToken
  // (complete-profile не возвращает токен, нужен для последующего claim орг).
  const userTokens = new Map<string, string>();
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

    // Повторно логинимся, чтобы получить токен (нужен для claim орг).
    await publicApi.POST('/auth/request-otp', { body: { phoneNumber: user.phone } });
    const { data: loginData } = await publicApi.POST('/auth/verify-otp', {
      body: { phoneNumber: user.phone, code: otpCode },
    });
    if (!loginData || loginData.type !== 'authenticated') {
      throw new Error(`Login failed for ${user.fullName}: ${JSON.stringify(loginData)}`);
    }
    userTokens.set(user.phone, loginData.accessToken);

    console.log(`  → User: ${user.fullName}`);
  }

  // Item types
  for (const itemType of ITEM_TYPES) {
    await api.POST('/cms/item-types', { body: itemType });
    console.log(`  → Item type: ${itemType.name}`);
  }

  // Categories (parent-first ordering — CATEGORIES уже отсортирован: корневые перед дочерними)
  for (const cat of CATEGORIES) {
    const iconId = await uploadImage(api, cat.fixture);
    await api.POST('/cms/categories', {
      body: {
        id: cat.id,
        parentCategoryId: cat.parentCategoryId,
        name: cat.name,
        allowedTypeIds: cat.allowedTypeIds,
        ageGroups: cat.ageGroups,
        iconId,
        order: 0,
      },
    });
    console.log(`  → Category: ${cat.name}${cat.parentCategoryId ? ' (sub)' : ''}`);
  }

  // Attributes — добавляем ДО publish, иначе на момент проекции они ещё не будут в state'е категории
  for (const attr of CATEGORY_ATTRIBUTES) {
    await api.POST('/cms/categories/{id}/attributes', {
      params: { path: { id: attr.categoryId } },
      body: {
        attributeId: attr.attributeId,
        name: attr.name,
        required: attr.required,
        schema: attr.schema,
      },
    });
    console.log(`  → Attribute: ${attr.name} → ${attr.categoryId}`);
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

  // Owner assignment: первые 3 USERS клеймят соответствующие орг по claim-токену.
  // Это нужно чтобы из мобилы было видно «свои» орг и можно было руками
  // проверить чат user → org (employee/owner отвечает с другой стороны).
  const OWNER_ASSIGNMENTS = [
    { phone: USERS[0].phone, orgIndex: 0 }, // Алексей Петров   → Студия йоги «Прана»
    { phone: USERS[1].phone, orgIndex: 1 }, // Мария Иванова    → Школа танцев «Ритм»
    { phone: USERS[2].phone, orgIndex: 2 }, // Дмитрий Козлов   → Кофейня «Зерно»
  ];
  for (const { phone, orgIndex } of OWNER_ASSIGNMENTS) {
    const orgId = orgIds[orgIndex];
    if (!orgId) throw new Error(`Missing orgId for index ${orgIndex}`);
    const ownerToken = userTokens.get(phone);
    if (!ownerToken) throw new Error(`Missing token for owner ${phone}`);

    const { data: tokenData } = await api.GET('/admin/organizations/{id}/claim-token', {
      params: { path: { id: orgId } },
    });
    if (!tokenData?.claimToken) throw new Error(`No claim token for org ${orgId}`);

    const ownerApi = createAuthedApi(baseUrl, ownerToken);
    const { error: claimErr } = await ownerApi.POST('/organizations/claim', {
      body: { token: tokenData.claimToken },
    });
    if (claimErr) {
      throw new Error(`Failed to claim org ${ORGANIZATIONS[orgIndex]?.name}: ${JSON.stringify(claimErr)}`);
    }
    console.log(`  → Owner: ${USERS[orgIndex]?.fullName} → ${ORGANIZATIONS[orgIndex]?.name}`);
  }

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
  attributes?: { attributeId: string; value: string }[];
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
    { type: 'category', categoryIds: [item.categoryId], attributes: item.attributes ?? [] },
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
