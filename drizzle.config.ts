import { defineConfig } from 'drizzle-kit';
import { config } from '@dotenvx/dotenvx';

config({ convention: 'nextjs' });

export default defineConfig({
  out: './drizzle',
  schema: './src/infra/db/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DB_URL']!,
  },
  migrations: {
    schema: 'public',
  },
});
