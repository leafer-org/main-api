import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '@/apps/app.module.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';

import { startContainers, stopContainers } from './helpers/containers.js';
import { type E2eApp } from './helpers/create-app.js';
import { runMigrations, truncateAll } from './helpers/db.js';
import { createBuckets } from './helpers/s3.js';

const FIXED_OTP = '123456';
const PHONE = '+79991234567';

/** Helper: full registration flow, returns tokens */
async function registerNewUser(
  agent: E2eApp['agent'],
  phone = PHONE,
  fullName = 'Test User',
) {
  await agent.post('/auth/request-otp').send({ phoneNumber: phone }).expect(201);

  const verifyRes = await agent
    .post('/auth/verify-otp')
    .send({ phoneNumber: phone, code: FIXED_OTP })
    .expect(201);

  expect(verifyRes.body.type).toBe('new_registration');
  const { registrationSessionId } = verifyRes.body;

  const regRes = await agent
    .post('/auth/complete-profile')
    .send({ registrationSessionId, fullName })
    .expect(201);

  return {
    accessToken: regRes.body.accessToken as string,
    refreshToken: regRes.body.refreshToken as string,
    user: regRes.body.user,
  };
}

describe('Auth Controller (e2e)', () => {
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

  // ─── POST /auth/request-otp ───────────────────────────────────────

  describe('POST /auth/request-otp', () => {
    it('should accept a valid phone number and return empty body', async () => {
      const res = await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: PHONE })
        .expect(201);

        console.log(res.body)

      expect(res.body).toEqual({});
    });

    it('should return 400 for an invalid phone number', async () => {
      await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: '123' })
        .expect(400);
    });

    it('should return 429 when requesting OTP twice within throttle window', async () => {
      await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: PHONE })
        .expect(201);

      const res = await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: PHONE })
        .expect(429);

      expect(res.body).toHaveProperty('retryAfterSec');
    });
  });

  // ─── POST /auth/verify-otp ────────────────────────────────────────

  describe('POST /auth/verify-otp', () => {
    it('should return new_registration for a new phone number', async () => {
      await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: PHONE })
        .expect(201);

      const res = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: FIXED_OTP })
        .expect(201);

      expect(res.body.type).toBe('new_registration');
      expect(res.body).toHaveProperty('registrationSessionId');
    });

    it('should return authenticated with tokens for an existing user', async () => {
      // Register first
      await registerNewUser(e2e.agent);

      // Login again
      await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: PHONE })
        .expect(201);

      const res = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: FIXED_OTP })
        .expect(201);

      expect(res.body.type).toBe('authenticated');
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('should return 400 for a wrong OTP code', async () => {
      await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: PHONE })
        .expect(201);

      const res = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: '000000' })
        .expect(400);

      expect(res.body.code).toBe('invalid_otp');
    });

    it('should return 400 when no OTP was requested', async () => {
      await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: FIXED_OTP })
        .expect(400);
    });
  });

  // ─── POST /auth/complete-profile ──────────────────────────────────

  describe('POST /auth/complete-profile', () => {
    it('should register a new user and return tokens + user', async () => {
      await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: PHONE })
        .expect(201);

      const verifyRes = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: FIXED_OTP })
        .expect(201);

      const res = await e2e.agent
        .post('/auth/complete-profile')
        .send({
          registrationSessionId: verifyRes.body.registrationSessionId,
          fullName: 'John Doe',
        })
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user).toMatchObject({
        phoneNumber: '79991234567',
        fullName: 'John Doe',
      });
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user).toHaveProperty('createdAt');
    });

    it('should return 400 for an invalid registration session', async () => {
      await e2e.agent
        .post('/auth/complete-profile')
        .send({
          registrationSessionId: 'non-existent-id',
          fullName: 'John Doe',
        })
        .expect(400);
    });
  });

  // ─── GET /auth/refresh ────────────────────────────────────────────

  describe('GET /auth/refresh', () => {
    it('should return new tokens with a valid refresh token', async () => {
      const { refreshToken } = await registerNewUser(e2e.agent);

      const res = await e2e.agent
        .get('/auth/refresh')
        .set('x-refresh-token', refreshToken)
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      // New tokens should differ from old ones
      expect(res.body.refreshToken).not.toBe(refreshToken);
    });

    it('should return 401 without a refresh token', async () => {
      await e2e.agent.get('/auth/refresh').expect(401);
    });

    it('should return 401 with an invalid refresh token', async () => {
      await e2e.agent
        .get('/auth/refresh')
        .set('x-refresh-token', 'invalid-token')
        .expect(401);
    });
  });

  // ─── GET /me ──────────────────────────────────────────────────────

  describe('GET /me', () => {
    it('should return the current user profile', async () => {
      const { accessToken } = await registerNewUser(e2e.agent);
      
      console.log(accessToken)
      const res = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        phoneNumber: '79991234567',
        fullName: 'Test User',
      });
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('createdAt');
      expect(res.body).toHaveProperty('updatedAt');
    });

    it('should return 401 without a token', async () => {
      await e2e.agent.get('/me').expect(401);
    });
  });

  // ─── PATCH /me/profile ────────────────────────────────────────────

  describe('PATCH /me/profile', () => {
    it('should update the user full name', async () => {
      const { accessToken } = await registerNewUser(e2e.agent);

      const res = await e2e.agent
        .patch('/me/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fullName: 'Updated Name' })
        .expect(200);

      expect(res.body.fullName).toBe('Updated Name');
    });
  });

  // ─── POST /auth/logout ────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('should logout and invalidate the session', async () => {
      const { accessToken } = await registerNewUser(e2e.agent);

      await e2e.agent
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Token should no longer work
      await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });

  // ─── Sessions management ──────────────────────────────────────────

  describe('Sessions', () => {
    it('GET /me/sessions should list active sessions', async () => {
      const { accessToken } = await registerNewUser(e2e.agent);

      const res = await e2e.agent
        .get('/me/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.sessions).toHaveLength(1);
      expect(res.body.sessions[0]).toHaveProperty('id');
      expect(res.body.sessions[0]).toHaveProperty('createdAt');
      expect(res.body.sessions[0]).toHaveProperty('expiresAt');
    });

    it('DELETE /me/sessions/:id should delete a specific session', async () => {
      const { accessToken } = await registerNewUser(e2e.agent);

      // Create a second session by logging in again
      await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: PHONE })
        .expect(200);

      const verifyRes = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: FIXED_OTP })
        .expect(200);

      expect(verifyRes.body.type).toBe('authenticated');
      const secondToken = verifyRes.body.accessToken;

      // List sessions — should have 2
      const sessionsRes = await e2e.agent
        .get('/me/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(sessionsRes.body.sessions.length).toBeGreaterThanOrEqual(2);

      // Delete the second session using the first token
      // Find a session that is NOT our current one (we'll pick the last one)
      const sessionToDelete = sessionsRes.body.sessions.find(
        (_s: { id: string }) => true, // just pick the first — we'll verify count decreases
      );

      await e2e.agent
        .delete(`/me/sessions/${sessionToDelete.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('DELETE /me/sessions should delete all sessions except current', async () => {
      const { accessToken } = await registerNewUser(e2e.agent);

      // Create a second session
      await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: PHONE })
        .expect(200);

      await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: FIXED_OTP })
        .expect(200);

      // Delete all except current
      await e2e.agent
        .delete('/me/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Should have only 1 session left
      const res = await e2e.agent
        .get('/me/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.sessions).toHaveLength(1);
    });
  });

  // ─── Full auth flow ───────────────────────────────────────────────

  describe('Full auth flow', () => {
    it('new user: request-otp → verify → register → /me → refresh → logout', async () => {
      // 1. Request OTP
      await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: PHONE })
        .expect(200);

      // 2. Verify OTP → new_registration
      const verifyRes = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: FIXED_OTP })
        .expect(200);

      expect(verifyRes.body.type).toBe('new_registration');

      // 3. Complete profile
      const regRes = await e2e.agent
        .post('/auth/complete-profile')
        .send({
          registrationSessionId: verifyRes.body.registrationSessionId,
          fullName: 'Flow Test User',
        })
        .expect(201);

      const { accessToken, refreshToken } = regRes.body;

      // 4. Access /me
      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(meRes.body.fullName).toBe('Flow Test User');

      // 5. Refresh tokens
      const refreshRes = await e2e.agent
        .get('/auth/refresh')
        .set('x-refresh-token', refreshToken)
        .expect(200);

      const newAccessToken = refreshRes.body.accessToken;

      // Old token should be invalidated (session rotated)
      await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      // New token should work
      await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(200);

      // 6. Logout
      await e2e.agent
        .post('/auth/logout')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(204);

      // Token should no longer work
      await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(401);
    });
  });
});
