import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startContainers, stopContainers } from './helpers/containers.js';
import { type E2eApp } from './helpers/create-app.js';
import { runMigrations, truncateAll } from './helpers/db.js';
import { createBuckets } from './helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';

const FIXED_OTP = '123456';
const PHONE = '+79991234567';

async function getAccessToken(agent: E2eApp['agent']): Promise<string> {
  await agent.post('/auth/request-otp').send({ phoneNumber: PHONE }).expect(200);

  const verifyRes = await agent
    .post('/auth/verify-otp')
    .send({ phoneNumber: PHONE, code: FIXED_OTP })
    .expect(200);

  const { registrationSessionId } = verifyRes.body;

  const regRes = await agent
    .post('/auth/complete-profile')
    .send({ registrationSessionId, fullName: 'Test User' })
    .expect(200);

  return regRes.body.accessToken as string;
}

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

  describe('POST /media/upload-request', () => {
    it('should create a file record and return fileId + presigned uploadUrl', async () => {
      const accessToken = await getAccessToken(e2e.agent);

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
  });
});
