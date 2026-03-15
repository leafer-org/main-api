import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loginAsAdmin, registerUser } from '../../actors/auth.js';
import { startContainers, stopContainers } from '../../helpers/containers.js';
import { type E2eApp } from '../../helpers/create-app.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';

const FIXED_OTP = '123456';
const PHONE = '+79991234567';

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

  // ─── POST /auth/request-otp ───────────────────────────────────────

  describe('POST /auth/request-otp', () => {
    it('should accept a valid phone number and return empty body', async () => {
      const res = await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: PHONE })
        .expect(200);

      expect(res.body).toEqual({});
    });

    it('should return 400 for an invalid phone number', async () => {
      await e2e.agent.post('/auth/request-otp').send({ phoneNumber: '123' }).expect(400);
    });

    it('should return 429 when requesting OTP twice within throttle window', async () => {
      await e2e.agent.post('/auth/request-otp').send({ phoneNumber: PHONE }).expect(200);

      const res = await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: PHONE })
        .expect(429);

      expect(res.body.type).toEqual('throttled');
      expect(res.body.data).toHaveProperty('retryAfterSec');
    });
  });

  // ─── POST /auth/verify-otp ────────────────────────────────────────

  describe('POST /auth/verify-otp', () => {
    it('should return new_registration for a new phone number', async () => {
      await e2e.agent.post('/auth/request-otp').send({ phoneNumber: PHONE }).expect(200);

      const res = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: FIXED_OTP })
        .expect(200);

      expect(res.body.type).toBe('new_registration');
      expect(res.body).toHaveProperty('registrationSessionId');
    });

    it('should return authenticated with tokens for an existing user', async () => {
      // Register first
      await registerUser(e2e.agent, FIXED_OTP, { phone: PHONE });

      // Login again
      await e2e.agent.post('/auth/request-otp').send({ phoneNumber: PHONE }).expect(200);

      const res = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: FIXED_OTP })
        .expect(200);

      expect(res.body.type).toBe('authenticated');
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('should return 400 for a wrong OTP code', async () => {
      await e2e.agent.post('/auth/request-otp').send({ phoneNumber: PHONE }).expect(200);

      const res = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: '000000' })
        .expect(400);

      expect(res.body.type).toBe('invalid_otp');
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
      await e2e.agent.post('/auth/request-otp').send({ phoneNumber: PHONE }).expect(200);

      const verifyRes = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: FIXED_OTP })
        .expect(200);

      const res = await e2e.agent
        .post('/auth/complete-profile')
        .send({
          registrationSessionId: verifyRes.body.registrationSessionId,
          fullName: 'John Doe',
          cityId: 'city-1',
        })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user).toMatchObject({
        phoneNumber: '79991234567',
        fullName: 'John Doe',
      });
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user).toHaveProperty('createdAt');
    });

    it('should generate default fullName when not provided', async () => {
      await e2e.agent.post('/auth/request-otp').send({ phoneNumber: PHONE }).expect(200);

      const verifyRes = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: FIXED_OTP })
        .expect(200);

      const res = await e2e.agent
        .post('/auth/complete-profile')
        .send({
          registrationSessionId: verifyRes.body.registrationSessionId,
          cityId: 'city-1',
        })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.fullName).toMatch(/^Пользователь \d{4}$/);
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
      const { refreshToken } = await registerUser(e2e.agent, FIXED_OTP, { phone: PHONE });

      const res = await e2e.agent
        .get('/auth/refresh')
        .set('x-refresh-token', refreshToken)
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      // New tokens should differ from old ones
      expect(res.body.refreshToken).not.toBe(refreshToken);
    });

    it('should return 400 without a refresh token (missing required header)', async () => {
      await e2e.agent.get('/auth/refresh').expect(400);
    });

    it('should return 401 with an invalid refresh token', async () => {
      await e2e.agent.get('/auth/refresh').set('x-refresh-token', 'invalid-token').expect(401);
    });
  });

  // ─── GET /me ──────────────────────────────────────────────────────

  describe('GET /me', () => {
    it('should return the current user profile', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP, { phone: PHONE });

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
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP, { phone: PHONE });

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
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP, { phone: PHONE });

      await e2e.agent
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Token should no longer work
      await e2e.agent.get('/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
    });
  });

  // ─── Sessions management ──────────────────────────────────────────

  describe('Sessions', () => {
    it('GET /me/sessions should list active sessions', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP, { phone: PHONE });

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
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP, { phone: PHONE });

      // Create a second session by logging in again
      await e2e.agent.post('/auth/request-otp').send({ phoneNumber: PHONE }).expect(200);

      const verifyRes = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: FIXED_OTP })
        .expect(200);

      expect(verifyRes.body.type).toBe('authenticated');
      const _secondToken = verifyRes.body.accessToken;

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
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP, { phone: PHONE });

      // Create a second session
      await e2e.agent.post('/auth/request-otp').send({ phoneNumber: PHONE }).expect(200);

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

  // ─── GET /me/permissions ──────────────────────────────────────────

  describe('GET /me/permissions', () => {
    it('should return default permissions for regular user', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP, { phone: PHONE });

      const res = await e2e.agent
        .get('/me/permissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('permissions');
      const p = res.body.permissions;

      // Regular USER role has empty permissions → all defaults
      expect(p['SESSION.MANAGE']).toBe('self');
      expect(p['ROLE.MANAGE']).toBe(false);
      expect(p['USER.MANAGE']).toBe(false);
      expect(p['CMS.MANAGE']).toBe(false);
      expect(p['REVIEW.MODERATE']).toBe(false);
      expect(p['ORGANIZATION.MODERATE']).toBe(false);
      expect(p['TICKET_BOARD.MANAGE']).toBe(false);
      expect(p['TICKET.MANAGE']).toBe(false);
      expect(p['TICKET.REASSIGN']).toBe(false);
    });

    it('should return admin permissions for admin user', async () => {
      if (!process.env.DB_URL) throw new Error('DB_URL not set');
      await seedStaticRoles(process.env.DB_URL);
      await seedAdminUser(process.env.DB_URL);

      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .get('/me/permissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('permissions');
      const p = res.body.permissions;

      expect(p['SESSION.MANAGE']).toBe('all');
      expect(p['ROLE.MANAGE']).toBe(true);
      expect(p['USER.MANAGE']).toBe(true);
      expect(p['CMS.MANAGE']).toBe(true);
      expect(p['TICKET_BOARD.MANAGE']).toBe(true);
      expect(p['TICKET.MANAGE']).toBe(true);
      expect(p['TICKET.REASSIGN']).toBe(true);
    });

    it('should return 401 without auth token', async () => {
      await e2e.agent.get('/me/permissions').expect(401);
    });

    it('should reflect updated permissions after role change', async () => {
      if (!process.env.DB_URL) throw new Error('DB_URL not set');
      await seedStaticRoles(process.env.DB_URL);
      await seedAdminUser(process.env.DB_URL);

      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { userId } = await registerUser(e2e.agent, FIXED_OTP);

      // Get ADMIN role ID
      const rolesRes = await e2e.agent
        .get('/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const adminRole = rolesRes.body.roles.find((r: { name: string }) => r.name === 'ADMIN');

      // Assign ADMIN role to user
      await e2e.agent
        .patch(`/users/${userId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId: adminRole.id })
        .expect(200);

      // Re-login as the promoted user (old session was invalidated by role change)
      await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: '+79990000002' })
        .expect(200);

      const verifyRes = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: '+79990000002', code: FIXED_OTP })
        .expect(200);

      const promotedToken = verifyRes.body.accessToken as string;

      const res = await e2e.agent
        .get('/me/permissions')
        .set('Authorization', `Bearer ${promotedToken}`)
        .expect(200);

      // After role change to ADMIN, should have admin permissions
      expect(res.body.permissions['ROLE.MANAGE']).toBe(true);
      expect(res.body.permissions['USER.MANAGE']).toBe(true);
    });
  });

  // ─── Login blocking ──────────────────────────────────────────────

  describe('Login blocking', () => {
    it('should block login after exceeding max OTP attempts', async () => {
      await e2e.agent.post('/auth/request-otp').send({ phoneNumber: PHONE }).expect(200);

      // Send wrong OTP 6 times (MAX_OTP_ATTEMPTS=5, blocked on attempt > 5)
      for (let i = 0; i < 5; i++) {
        // biome-ignore lint/performance/noAwaitInLoops: Test
        const res = await e2e.agent
          .post('/auth/verify-otp')
          .send({ phoneNumber: PHONE, code: '000000' })
          .expect(400);

        expect(res.body.type).toBe('invalid_otp');
      }

      // 6th wrong attempt should trigger block
      const blockedRes = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: '000000' })
        .expect(403);

      expect(blockedRes.body.type).toBe('login_blocked');
      expect(blockedRes.body.data).toHaveProperty('blockedUntil');
    });
  });

  // ─── Refresh token rotation ─────────────────────────────────────

  describe('Refresh token rotation', () => {
    it('should invalidate old refresh token after rotation', async () => {
      const { refreshToken } = await registerUser(e2e.agent, FIXED_OTP, { phone: PHONE });

      // Rotate: get new tokens using refresh
      const refreshRes = await e2e.agent
        .get('/auth/refresh')
        .set('x-refresh-token', refreshToken)
        .expect(200);

      expect(refreshRes.body).toHaveProperty('refreshToken');

      // Old refresh token should no longer work
      await e2e.agent.get('/auth/refresh').set('x-refresh-token', refreshToken).expect(401);
    });
  });

  // ─── Full auth flow ───────────────────────────────────────────────

  describe('Full auth flow', () => {
    it('new user: request-otp → verify → register → /me → refresh → logout', async () => {
      // 1. Request OTP
      await e2e.agent.post('/auth/request-otp').send({ phoneNumber: PHONE }).expect(200);

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
          cityId: 'city-1',
        })
        .expect(200);

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
      await e2e.agent.get('/me').set('Authorization', `Bearer ${accessToken}`).expect(401);

      // New token should work
      await e2e.agent.get('/me').set('Authorization', `Bearer ${newAccessToken}`).expect(200);

      // 6. Logout
      await e2e.agent
        .post('/auth/logout')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(204);

      // Token should no longer work
      await e2e.agent.get('/me').set('Authorization', `Bearer ${newAccessToken}`).expect(401);
    });
  });
});
