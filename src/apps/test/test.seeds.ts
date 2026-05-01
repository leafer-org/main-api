import type { cmsCities } from '@/features/cms/adapters/db/schema.js';
import { ALL_PERMISSIONS } from '@/kernel/domain/permissions.js';

export const ADMIN_PHONE = '79990000001';

export const STATIC_ROLES = [
  {
    name: 'ADMIN',
    permissions: [...ALL_PERMISSIONS],
    isStatic: true,
  },
  {
    name: 'USER',
    permissions: [],
    isStatic: true,
  },
];

export const CITIES = [
  { id: 'moscow', name: 'Москва', lat: 55.7558, lng: 37.6173 },
  { id: 'spb', name: 'Санкт-Петербург', lat: 59.9343, lng: 30.3351 },
  { id: 'novosibirsk', name: 'Новосибирск', lat: 55.0084, lng: 82.9357 },
  { id: 'ekaterinburg', name: 'Екатеринбург', lat: 56.8389, lng: 60.6057 },
  { id: 'kazan', name: 'Казань', lat: 55.7887, lng: 49.1221 },
  { id: 'nizhny-novgorod', name: 'Нижний Новгород', lat: 56.2965, lng: 43.9361 },
  { id: 'chelyabinsk', name: 'Челябинск', lat: 55.1644, lng: 61.4368 },
  { id: 'samara', name: 'Самара', lat: 53.1959, lng: 50.1002 },
  { id: 'omsk', name: 'Омск', lat: 54.9885, lng: 73.3242 },
  { id: 'rostov-on-don', name: 'Ростов-на-Дону', lat: 47.2357, lng: 39.7015 },
  { id: 'ufa', name: 'Уфа', lat: 54.7388, lng: 55.9721 },
  { id: 'krasnoyarsk', name: 'Красноярск', lat: 56.0153, lng: 92.8932 },
  { id: 'voronezh', name: 'Воронеж', lat: 51.6683, lng: 39.2034 },
  { id: 'perm', name: 'Пермь', lat: 58.0105, lng: 56.2502 },
  { id: 'volgograd', name: 'Волгоград', lat: 48.708, lng: 44.5133 },
  { id: 'krasnodar', name: 'Краснодар', lat: 45.0353, lng: 38.975 },
  { id: 'sochi', name: 'Сочи', lat: 43.6028, lng: 39.7342 },
  { id: 'tyumen', name: 'Тюмень', lat: 57.1553, lng: 65.5619 },
  { id: 'tolyatti', name: 'Тольятти', lat: 53.5303, lng: 49.3461 },
  { id: 'izhevsk', name: 'Ижевск', lat: 56.8527, lng: 53.2114 },
  { id: 'arkhangelsk', name: 'Архангельск', lat: 64.5399, lng: 40.5152 },
] satisfies (typeof cmsCities.$inferInsert)[];
