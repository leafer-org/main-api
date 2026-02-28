import { resolve } from 'node:path';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// biome-ignore lint/style/noDefaultExport: vitest config to be exported as default
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/test/e2e/**/*.e2e-spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
  },
  plugins: [
    swc.vite({
      module: {
        type: 'es6',
      },
    }),
  ],
});
