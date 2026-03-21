import { config } from '@dotenvx/dotenvx';

import { ADMIN_PHONE } from './seeds.js';

config({ convention: 'nextjs' });

// --- HTTP helpers ---

async function api(baseUrl: string, method: string, path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json();
}

async function loginAdmin(baseUrl: string, otpCode: string): Promise<string> {
  const phone = `+${ADMIN_PHONE}`;

  await api(baseUrl, 'POST', '/auth/request-otp', { phoneNumber: phone });
  const res = await api(baseUrl, 'POST', '/auth/verify-otp', {
    phoneNumber: phone,
    code: otpCode,
  });

  if (res.type !== 'authenticated') {
    throw new Error(`Admin login failed: ${JSON.stringify(res)}`);
  }

  return res.accessToken as string;
}

async function uploadIcon(baseUrl: string, token: string): Promise<string> {
  // Request presigned upload
  const uploadReq = await api(baseUrl, 'POST', '/media/image/upload-request', {
    name: 'seed-icon.png',
    mimeType: 'image/png',
  }, token);

  const { fileId, uploadUrl, uploadFields } = uploadReq;

  // Upload a minimal 1x1 PNG
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );

  const form = new FormData();
  for (const [key, value] of Object.entries(uploadFields as Record<string, string>)) {
    form.append(key, value);
  }
  form.append('file', new Blob([pngBytes], { type: 'image/png' }), 'seed-icon.png');

  const uploadRes = await fetch(uploadUrl, { method: 'POST', body: form });
  if (!uploadRes.ok && uploadRes.status !== 204) {
    throw new Error(`Icon upload failed: ${uploadRes.status}`);
  }

  return fileId as string;
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
      { type: 'base-info', required: true },
      { type: 'category', required: true },
      { type: 'owner', required: true },
      { type: 'age-group', required: false },
      { type: 'location', required: false },
      { type: 'payment', required: true, allowedStrategies: ['free', 'one-time', 'subscription'] },
      { type: 'schedule', required: false },
    ],
  },
  {
    id: ITEM_TYPE_EVENT_ID,
    name: 'Мероприятие',
    label: 'мероприятие',
    widgetSettings: [
      { type: 'base-info', required: true },
      { type: 'category', required: true },
      { type: 'owner', required: true },
      { type: 'age-group', required: true },
      { type: 'location', required: true },
      { type: 'payment', required: true, allowedStrategies: ['free', 'one-time'] },
      { type: 'event-date-time', required: true, maxDates: null },
    ],
  },
];

const CATEGORIES = [
  {
    id: '00000000-0000-0000-0001-000000000001',
    name: 'Образование',
    allowedTypeIds: [ITEM_TYPE_SERVICE_ID, ITEM_TYPE_EVENT_ID],
    ageGroups: ['children', 'adults'],
  },
  {
    id: '00000000-0000-0000-0001-000000000002',
    name: 'Спорт',
    allowedTypeIds: [ITEM_TYPE_SERVICE_ID, ITEM_TYPE_EVENT_ID],
    ageGroups: ['children', 'adults'],
  },
  {
    id: '00000000-0000-0000-0001-000000000003',
    name: 'Творчество',
    allowedTypeIds: [ITEM_TYPE_SERVICE_ID],
    ageGroups: ['children', 'adults'],
  },
  {
    id: '00000000-0000-0000-0001-000000000004',
    name: 'Развлечения',
    allowedTypeIds: [ITEM_TYPE_EVENT_ID],
    ageGroups: ['children', 'adults'],
  },
];

// --- Main ---

export async function seedCms(baseUrl: string, otpCode: string) {
  const token = await loginAdmin(baseUrl, otpCode);

  // Item types
  for (const itemType of ITEM_TYPES) {
    await api(baseUrl, 'POST', '/cms/item-types', itemType, token);
    console.log(`  → Item type: ${itemType.name}`);
  }

  // Categories (each needs its own icon)
  for (const cat of CATEGORIES) {
    const iconId = await uploadIcon(baseUrl, token);
    await api(baseUrl, 'POST', '/cms/categories', {
      ...cat,
      iconId,
      order: 0,
    }, token);
    console.log(`  → Category: ${cat.name}`);
  }

  // Publish categories
  for (const cat of CATEGORIES) {
    await api(baseUrl, 'POST', `/cms/categories/${cat.id}/publish`, {}, token);
  }
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
