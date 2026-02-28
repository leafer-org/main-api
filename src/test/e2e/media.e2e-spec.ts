import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startContainers, stopContainers } from './helpers/containers.js';
import { createApp, type E2eApp } from './helpers/create-app.js';
import { runMigrations, truncateAll } from './helpers/db.js';
import { createBuckets } from './helpers/s3.js';

describe('Media Controller (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    await startContainers();
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await runMigrations(process.env.DB_URL);
    await createBuckets();
    e2e = await createApp();
  });

  afterEach(async () => {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await truncateAll(process.env.DB_URL);
  });

  afterAll(async () => {
    await e2e?.app.close();
    await stopContainers();
  });

  describe('POST /media/upload-request', () => {
    it('should create a file record and return fileId + presigned uploadUrl', async () => {
      const response = await e2e.agent
        .post('/media/upload-request')
        .send({
          name: 'test-image.png',
          mimeType: 'image/png',
          bucket: 'media-public',
        })
        .expect(201);

      expect(response.body).toHaveProperty('fileId');
      expect(response.body).toHaveProperty('uploadUrl');
      expect(response.body.fileId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(response.body.uploadUrl).toContain(process.env.S3_ENDPOINT);
      expect(response.body.uploadUrl).toContain('media-public-temp');
    });
  });
});
