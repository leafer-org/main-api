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
import { MediaService } from '@/kernel/application/ports/media.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { FileId } from '@/kernel/domain/ids.js';

const FIXED_OTP = '123456';

// 1x1 red pixel PNG — valid image that imgproxy can process
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function uploadViaPresignedPost(
  uploadUrl: string,
  uploadFields: Record<string, string>,
  file: Buffer,
  contentType: string,
): Promise<Response> {
  const formData = new FormData();
  for (const [key, value] of Object.entries(uploadFields)) {
    formData.append(key, value);
  }
  formData.append('file', new Blob([new Uint8Array(file)], { type: contentType }));
  return fetch(uploadUrl, { method: 'POST', body: formData });
}

describe('Media Controller (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    await startContainers({ imgproxy: true });
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
    it('should create a file record and return fileId + presigned post data', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      const response = await e2e.agent
        .post('/media/upload-request')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'test-image.png',
          mimeType: 'image/png',
        })
        .expect(200);

      expect(response.body).toHaveProperty('fileId');
      expect(response.body).toHaveProperty('uploadUrl');
      expect(response.body).toHaveProperty('uploadFields');
      expect(response.body.fileId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(response.body.uploadUrl).toContain(process.env.S3_ENDPOINT);
      expect(response.body.uploadUrl).toContain('media-public-temp');
      expect(typeof response.body.uploadFields).toBe('object');
      expect(response.body.uploadFields).toHaveProperty('Content-Type', 'image/png');
    });

    it('should return 400 for invalid mimeType', async () => {
      const res = await e2e.agent
        .post('/media/upload-request')
        .send({ name: 'file.txt', mimeType: 'not-a-mime' })
        .expect(400);

      expect(res.body.type).toBe('invalid_mime_type');
    });

    it('should return 400 for empty file name', async () => {
      await e2e.agent
        .post('/media/upload-request')
        .send({ name: '', mimeType: 'image/png' })
        .expect(400);
    });

    it('should return 400 for file name exceeding 255 characters', async () => {
      const longName = 'a'.repeat(256);

      await e2e.agent
        .post('/media/upload-request')
        .send({ name: longName, mimeType: 'image/png' })
        .expect(400);
    });
  });

  // ─── GET /media/preview/:mediaId ──────────────────────────────────

  describe('GET /media/preview/:mediaId', () => {
    it('should return presigned preview URL for a temporary file', async () => {
      const uploadRes = await e2e.agent
        .post('/media/upload-request')
        .send({ name: 'preview-test.png', mimeType: 'image/png' })
        .expect(200);

      const { uploadUrl, uploadFields } = uploadRes.body;
      await uploadViaPresignedPost(uploadUrl, uploadFields, Buffer.from('fake-image'), 'image/png');

      const res = await e2e.agent.get(`/media/preview/${uploadRes.body.fileId}`).expect(200);

      expect(res.body).toHaveProperty('url');
      expect(res.body.url).toContain(process.env.S3_ENDPOINT);
    });

    it('should return 404 for non-existent mediaId', async () => {
      await e2e.agent.get('/media/preview/00000000-0000-0000-0000-000000000000').expect(404);
    });
  });

  // ─── Image Proxy ───────────────────────────────────────────────────

  describe('Image Proxy (via MediaService)', () => {
    async function uploadAndUseImage(): Promise<string> {
      const uploadRes = await e2e.agent
        .post('/media/upload-request')
        .send({ name: 'proxy-test.png', mimeType: 'image/png' })
        .expect(200);

      const { fileId, uploadUrl, uploadFields } = uploadRes.body;

      await uploadViaPresignedPost(uploadUrl, uploadFields, TINY_PNG, 'image/png');

      const mediaService = e2e.app.get(MediaService);
      const txHost = e2e.app.get(TransactionHost);
      await txHost.startTransaction(async (tx) => {
        await mediaService.useFiles(tx, [FileId.raw(fileId)]);
      });

      return fileId;
    }

    it('should generate signed imgproxy URL with resize parameters', async () => {
      const fileId = await uploadAndUseImage();
      const mediaService = e2e.app.get(MediaService);

      const url = await mediaService.getDownloadUrl(FileId.raw(fileId), {
        visibility: 'PUBLIC',
        imageProxy: { width: 128, height: 128 },
      });

      expect(url).toBeTruthy();
      expect(url).toContain(process.env.MEDIA_IMAGE_PROXY_URL);
      expect(url).toContain('rs:fit:128:128');
      expect(url).toContain('plain/s3://media-public/');
      // Signed — no /insecure/ segment
      expect(url).not.toContain('/insecure/');
    });

    it('should generate different URLs for different sizes', async () => {
      const fileId = await uploadAndUseImage();
      const mediaService = e2e.app.get(MediaService);

      const [small, large] = await mediaService.getDownloadUrls([
        {
          fileId: FileId.raw(fileId),
          options: { visibility: 'PUBLIC', imageProxy: { width: 64, height: 64 } },
        },
        {
          fileId: FileId.raw(fileId),
          options: { visibility: 'PUBLIC', imageProxy: { width: 512, height: 512 } },
        },
      ]);

      expect(small).toContain('rs:fit:64:64');
      expect(large).toContain('rs:fit:512:512');
      expect(small).not.toBe(large);
    });

    it('should bypass proxy for non-image files', async () => {
      const uploadRes = await e2e.agent
        .post('/media/upload-request')
        .send({ name: 'document.pdf', mimeType: 'application/pdf' })
        .expect(200);

      const { uploadUrl, uploadFields } = uploadRes.body;
      await uploadViaPresignedPost(
        uploadUrl,
        uploadFields,
        Buffer.from('fake-pdf-content'),
        'application/pdf',
      );

      const mediaService = e2e.app.get(MediaService);
      const txHost = e2e.app.get(TransactionHost);
      await txHost.startTransaction(async (tx) => {
        await mediaService.useFiles(tx, [FileId.raw(uploadRes.body.fileId)]);
      });

      const url = await mediaService.getDownloadUrl(FileId.raw(uploadRes.body.fileId), {
        visibility: 'PUBLIC',
        imageProxy: { width: 128, height: 128 },
      });

      // Non-image: direct S3 presigned URL, not proxied
      expect(url).toContain(process.env.S3_ENDPOINT);
      expect(url).not.toContain(process.env.MEDIA_IMAGE_PROXY_URL);
    });

    it('should serve resized image through imgproxy', async () => {
      const fileId = await uploadAndUseImage();
      const mediaService = e2e.app.get(MediaService);

      const url = await mediaService.getDownloadUrl(FileId.raw(fileId), {
        visibility: 'PUBLIC',
        imageProxy: { width: 64, height: 64, format: 'webp' },
      });

      if (!url) throw new Error('Expected url to be defined');
      expect(url).toContain('@webp');

      // Fetch the image from imgproxy — verify it actually processes and returns an image
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/webp');
    });

    it('should return presigned URL when no imageProxy options provided', async () => {
      const fileId = await uploadAndUseImage();
      const mediaService = e2e.app.get(MediaService);

      const url = await mediaService.getDownloadUrl(FileId.raw(fileId), {
        visibility: 'PUBLIC',
      });

      // Without imageProxy options — direct S3 URL
      expect(url).toContain(process.env.S3_ENDPOINT);
      expect(url).not.toContain(process.env.MEDIA_IMAGE_PROXY_URL);
    });
  });
});
