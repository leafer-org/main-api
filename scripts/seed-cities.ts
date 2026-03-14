import { config } from '@dotenvx/dotenvx';

import { seedCities } from './seeds.js';

config({ convention: 'nextjs' });

async function main() {
  const dbUrl = process.env['DB_URL'];
  if (!dbUrl) {
    console.error('DB_URL is not set');
    process.exit(1);
  }

  await seedCities(dbUrl);
  console.log('Seeded cities');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
