import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { registerUser } from './actors/auth.js';
import { startContainers, stopContainers } from './helpers/containers.js';
import { type E2eApp } from './helpers/create-app.js';
import { runMigrations, truncateAll } from './helpers/db.js';
import { createBuckets } from './helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';

const FIXED_OTP = '123456';

describe('Media Controller (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    await startContainers();
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await runMigrations(process.env.DB_URL);
    await createBuckets();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OtpGeneratorService)
      .useValue({ generate: () => OtpCode.raw(FIXED_OTP) })
      .compile();

    const app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    e2e = {
      app,
      agent: request(app.getHttpServer()),
    };
  });

  afterEach(async () => {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await truncateAll(process.env.DB_URL);
  });

  afterAll(async () => {
    await e2e?.app.close();
    await stopContainers();
  });

  // ─── POST /media/upload-request ──────────────────────────────────

  describe('POST /media/upload-request', () => {
    it('should create a file record and return fileId + presigned uploadUrl', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      const response = await e2e.agent
        .post('/media/upload-request')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-image.png',
          mimeType: 'image/png',
          bucket: 'media-public',
        })
        .expect(200);

      expect(response.body).toHaveProperty('fileId');
      expect(response.body).toHaveProperty('uploadUrl');
      expect(response.body.fileId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(response.body.uploadUrl).toContain(process.env.S3_ENDPOINT);
      expect(response.body.uploadUrl).toContain('media-public-temp');
    });

    it('should return 400 for invalid mimeType', async () => {
      const res = await e2e.agent
        .post('/media/upload-request')
        .send({ name: 'file.txt', mimeType: 'not-a-mime', bucket: 'media-public' })
        .expect(400);

      expect(res.body.code).toBe('invalid_mime_type');
    });

    it('should return 400 for empty file name', async () => {
      const res = await e2e.agent
        .post('/media/upload-request')
        .send({ name: '', mimeType: 'image/png', bucket: 'media-public' })
        .expect(400);

      expect(res.body.code).toBe('invalid_file_name');
    });

    it('should return 400 for file name exceeding 255 characters', async () => {
      const longName = 'a'.repeat(256);

      const res = await e2e.agent
        .post('/media/upload-request')
        .send({ name: longName, mimeType: 'image/png', bucket: 'media-public' })
        .expect(400);

      expect(res.body.code).toBe('invalid_file_name');
    });
  });

  // ─── POST /media/confirm-upload ────────────────────────────────────

  describe('POST /media/confirm-upload', () => {
    it('should confirm upload for a valid fileId', async () => {
      // Create an upload request first
      const uploadRes = await e2e.agent
        .post('/media/upload-request')
        .send({ name: 'test.png', mimeType: 'image/png', bucket: 'media-public' })
        .expect(200);

      const { fileId, uploadUrl } = uploadRes.body;

      // Upload a dummy file to S3 via presigned URL
      await fetch(uploadUrl, {
        method: 'PUT',
        body: Buffer.from('fake-image-data'),
        headers: { 'Content-Type': 'image/png' },
      });

      // Confirm the upload
      await e2e.agent
        .post('/media/confirm-upload')
        .send({ fileIds: [fileId] })
        .expect(200);
    });

    it('should return 404 for non-existent fileId', async () => {
      const res = await e2e.agent
        .post('/media/confirm-upload')
        .send({ fileIds: ['00000000-0000-0000-0000-000000000000'] })
        .expect(404);

      expect(res.body.code).toBe('file_not_found');
    });

    it('should confirm multiple files in a batch', async () => {
      // Create two upload requests
      const upload1 = await e2e.agent
        .post('/media/upload-request')
        .send({ name: 'file1.png', mimeType: 'image/png', bucket: 'media-public' })
        .expect(200);

      const upload2 = await e2e.agent
        .post('/media/upload-request')
        .send({ name: 'file2.jpg', mimeType: 'image/jpeg', bucket: 'media-public' })
        .expect(200);

      // Upload dummy data for both
      await Promise.all([
        fetch(upload1.body.uploadUrl, {
          method: 'PUT',
          body: Buffer.from('fake-data-1'),
          headers: { 'Content-Type': 'image/png' },
        }),
        fetch(upload2.body.uploadUrl, {
          method: 'PUT',
          body: Buffer.from('fake-data-2'),
          headers: { 'Content-Type': 'image/jpeg' },
        }),
      ]);

      // Confirm both in a single request
      await e2e.agent
        .post('/media/confirm-upload')
        .send({ fileIds: [upload1.body.fileId, upload2.body.fileId] })
        .expect(200);
    });
  });

  // ─── GET /media/preview/:mediaId ──────────────────────────────────

  describe('GET /media/preview/:mediaId', () => {
    it('should return presigned preview URL for a temporary file', async () => {
      // Create an upload request (file is temporary)
      const uploadRes = await e2e.agent
        .post('/media/upload-request')
        .send({ name: 'preview-test.png', mimeType: 'image/png', bucket: 'media-public' })
        .expect(200);

      // Upload dummy data
      await fetch(uploadRes.body.uploadUrl, {
        method: 'PUT',
        body: Buffer.from('fake-image'),
        headers: { 'Content-Type': 'image/png' },
      });

      const res = await e2e.agent.get(`/media/preview/${uploadRes.body.fileId}`).expect(200);

      expect(res.body).toHaveProperty('url');
      expect(res.body.url).toContain(process.env.S3_ENDPOINT);
    });

    it('should return 404 for non-existent mediaId', async () => {
      await e2e.agent.get('/media/preview/00000000-0000-0000-0000-000000000000').expect(404);
    });
  });

  // ─── POST /media/avatar/upload-request ────────────────────────────

  describe('POST /media/avatar/upload-request', () => {
    it('should return presigned URL and media metadata', async () => {
      const res = await e2e.agent
        .post('/media/avatar/upload-request')
        .send({ contentType: 'image/jpeg' })
        .expect(200);

      expect(res.body).toHaveProperty('bucket');
      expect(res.body).toHaveProperty('objectKey');
      expect(res.body).toHaveProperty('mediaId');
      expect(res.body).toHaveProperty('url');
      expect(res.body.visibility).toBe('PUBLIC');
      expect(res.body.contentType).toBe('image/jpeg');
      expect(res.body.url).toContain(process.env.S3_ENDPOINT);
    });

    it('should default contentType to image/jpeg when not provided', async () => {
      const res = await e2e.agent.post('/media/avatar/upload-request').send({}).expect(200);

      expect(res.body.contentType).toBe('image/jpeg');
    });
  });

  // ─── POST /media/avatar/preview-upload ────────────────────────────

  describe('POST /media/avatar/preview-upload', () => {
    it('should return avatar preview URLs for all sizes', async () => {
      // First create an avatar upload and upload data
      const avatarRes = await e2e.agent
        .post('/media/avatar/upload-request')
        .send({ contentType: 'image/jpeg' })
        .expect(200);

      await fetch(avatarRes.body.url, {
        method: 'PUT',
        body: Buffer.from('fake-avatar-data'),
        headers: { 'Content-Type': 'image/jpeg' },
      });

      const res = await e2e.agent
        .post('/media/avatar/preview-upload')
        .send({
          bucket: avatarRes.body.bucket,
          objectKey: avatarRes.body.objectKey,
          mediaId: avatarRes.body.mediaId,
          visibility: avatarRes.body.visibility,
          contentType: avatarRes.body.contentType,
        })
        .expect(200);

      expect(res.body).toHaveProperty('largeUrl');
      expect(res.body).toHaveProperty('mediumUrl');
      expect(res.body).toHaveProperty('smallUrl');
      expect(res.body).toHaveProperty('thumbUrl');
    });

    it('should return 404 for non-existent mediaId', async () => {
      await e2e.agent
        .post('/media/avatar/preview-upload')
        .send({
          bucket: 'media-public',
          objectKey: 'non-existent',
          mediaId: '00000000-0000-0000-0000-000000000000',
          visibility: 'PUBLIC',
        })
        .expect(404);
    });
  });
});
