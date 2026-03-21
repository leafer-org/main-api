import { config } from '@dotenvx/dotenvx';

import { seedAdminUser, seedCities, seedStaticRoles, truncateAll } from './seeds.js';

config({ convention: 'nextjs' });

async function main() {
  const dbUrl = process.env['DB_URL'];
  if (!dbUrl) {
    console.error('DB_URL is not set');
    process.exit(1);
  }

  await truncateAll(dbUrl);
  console.log('✓ Truncated all tables');

  await seedStaticRoles(dbUrl);
  console.log('✓ Seeded static roles');

  await seedAdminUser(dbUrl);
  console.log('✓ Seeded admin user');

  await seedCities(dbUrl);
  console.log('✓ Seeded cities');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
