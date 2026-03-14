import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

describe('Admin Sessions Controller (e2e)', () => {
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

  beforeEach(async () => {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await seedStaticRoles(process.env.DB_URL);
    await seedAdminUser(process.env.DB_URL);
  });

  afterEach(async () => {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await truncateAll(process.env.DB_URL);
  });

  afterAll(async () => {
    await e2e?.app.close();
    await stopContainers();
  });

  // ─── GET /admin/users/:userId/sessions ──────────────────────────────

  describe('GET /admin/users/:userId/sessions', () => {
    it('should return sessions of a user', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { userId } = await registerUser(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .get(`/admin/users/${userId}/sessions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.sessions).toBeInstanceOf(Array);
      expect(res.body.sessions.length).toBe(1);
      expect(res.body.sessions[0]).toHaveProperty('id');
      expect(res.body.sessions[0]).toHaveProperty('createdAt');
      expect(res.body.sessions[0]).toHaveProperty('expiresAt');
    });

    it('should return empty sessions for user with no active sessions', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .get('/admin/users/00000000-0000-0000-0000-000000000000/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.sessions).toEqual([]);
    });

    it('should return 401 without auth token', async () => {
      await e2e.agent.get('/admin/users/00000000-0000-0000-0000-000000000000/sessions').expect(401);
    });

    it('should return 403 for regular user without SESSION.MANAGE=all', async () => {
      const { accessToken, userId } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .get(`/admin/users/${userId}/sessions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });
  });

  // ─── DELETE /admin/users/:userId/sessions/:sessionId ────────────────

  describe('DELETE /admin/users/:userId/sessions/:sessionId', () => {
    it('should delete a specific session', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { userId } = await registerUser(e2e.agent, FIXED_OTP);

      // Get user's sessions
      const sessionsRes = await e2e.agent
        .get(`/admin/users/${userId}/sessions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const sessionId = sessionsRes.body.sessions[0].id;

      // Delete the session
      await e2e.agent
        .delete(`/admin/users/${userId}/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify session is deleted
      const afterRes = await e2e.agent
        .get(`/admin/users/${userId}/sessions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(afterRes.body.sessions).toHaveLength(0);
    });

    it('should invalidate user token after session deletion', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { accessToken: userToken, userId } = await registerUser(e2e.agent, FIXED_OTP);

      // Get user's session
      const sessionsRes = await e2e.agent
        .get(`/admin/users/${userId}/sessions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const sessionId = sessionsRes.body.sessions[0].id;

      // Admin deletes user's session
      await e2e.agent
        .delete(`/admin/users/${userId}/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // User's token should be invalidated
      await e2e.agent.get('/me').set('Authorization', `Bearer ${userToken}`).expect(401);
    });

    it('should return 403 for regular user', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .delete('/admin/users/00000000-0000-0000-0000-000000000000/sessions/00000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });
  });

  // ─── DELETE /admin/users/:userId/sessions ───────────────────────────

  describe('DELETE /admin/users/:userId/sessions', () => {
    it('should delete all sessions of a user', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { userId } = await registerUser(e2e.agent, FIXED_OTP);

      // Verify user has sessions
      const beforeRes = await e2e.agent
        .get(`/admin/users/${userId}/sessions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(beforeRes.body.sessions.length).toBeGreaterThan(0);

      // Delete all sessions
      await e2e.agent
        .delete(`/admin/users/${userId}/sessions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify all sessions are deleted
      const afterRes = await e2e.agent
        .get(`/admin/users/${userId}/sessions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(afterRes.body.sessions).toHaveLength(0);
    });

    it('should invalidate user token after all sessions deleted', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { accessToken: userToken, userId } = await registerUser(e2e.agent, FIXED_OTP);

      // Admin deletes all user sessions
      await e2e.agent
        .delete(`/admin/users/${userId}/sessions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // User's token should be invalidated
      await e2e.agent.get('/me').set('Authorization', `Bearer ${userToken}`).expect(401);
    });

    it('should return 204 even if user has no sessions', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .delete('/admin/users/00000000-0000-0000-0000-000000000000/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('should return 403 for regular user', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .delete('/admin/users/00000000-0000-0000-0000-000000000000/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });
  });
});
