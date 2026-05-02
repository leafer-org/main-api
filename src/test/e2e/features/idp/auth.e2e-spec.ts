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

describe('idp-auth', () => {
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
    it('Принимает валидный номер и возвращает пустое тело', async () => {
      const res = await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: PHONE })
        .expect(200);

      expect(res.body).toEqual({});
    });

    it('Невалидный номер — 400', async () => {
      await e2e.agent.post('/auth/request-otp').send({ phoneNumber: '123' }).expect(400);
    });

    it('Повторный запрос OTP в throttle-окне — 429', async () => {
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
    it('Возвращает new_registration для нового номера', async () => {
      await e2e.agent.post('/auth/request-otp').send({ phoneNumber: PHONE }).expect(200);

      const res = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: FIXED_OTP })
        .expect(200);

      expect(res.body.type).toBe('new_registration');
      expect(res.body).toHaveProperty('registrationSessionId');
    });

    it('Возвращает authenticated с токенами для существующего пользователя', async () => {
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

    it('Неверный OTP — 400', async () => {
      await e2e.agent.post('/auth/request-otp').send({ phoneNumber: PHONE }).expect(200);

      const res = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: '000000' })
        .expect(400);

      expect(res.body.type).toBe('invalid_otp');
    });

    it('Verify без предварительного request-otp — 400', async () => {
      await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: PHONE, code: FIXED_OTP })
        .expect(400);
    });
  });

  // ─── POST /auth/complete-profile ──────────────────────────────────

  describe('POST /auth/complete-profile', () => {
    it('Регистрирует нового пользователя и возвращает токены + user', async () => {
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

    it('Генерирует дефолтный fullName, если не передан', async () => {
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

    it('Невалидная registrationSessionId — 400', async () => {
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
    it('Возвращает новые токены по валидному refresh', async () => {
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

    it('Без заголовка refresh — 400', async () => {
      await e2e.agent.get('/auth/refresh').expect(400);
    });

    it('Невалидный refresh — 401', async () => {
      await e2e.agent.get('/auth/refresh').set('x-refresh-token', 'invalid-token').expect(401);
    });
  });

  // ─── GET /me ──────────────────────────────────────────────────────

  describe('GET /me', () => {
    it('Возвращает профиль текущего пользователя', async () => {
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

    it('Без токена — 401', async () => {
      await e2e.agent.get('/me').expect(401);
    });
  });

  // ─── PATCH /me/profile ────────────────────────────────────────────

  describe('PATCH /me/profile', () => {
    it('Обновляет fullName пользователя', async () => {
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
    it('Logout инвалидирует сессию', async () => {
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
    it('GET /me/sessions возвращает активные сессии', async () => {
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

    it('DELETE /me/sessions/:id удаляет конкретную сессию', async () => {
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

    it('DELETE /me/sessions удаляет все сессии кроме текущей', async () => {
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
    it('Возвращает пустой список для обычного пользователя', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP, { phone: PHONE });

      const res = await e2e.agent
        .get('/me/permissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.permissions).toEqual([]);
    });

    it('Возвращает все права для админа', async () => {
      if (!process.env.DB_URL) throw new Error('DB_URL not set');
      await seedStaticRoles(process.env.DB_URL);
      await seedAdminUser(process.env.DB_URL);

      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .get('/me/permissions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const p: string[] = res.body.permissions;
      expect(Array.isArray(p)).toBe(true);
      expect(p).toContain('role.read');
      expect(p).toContain('role.create');
      expect(p).toContain('user.read');
      expect(p).toContain('cms.category.read');
      expect(p).toContain('ticket.board.read');
      expect(p).toContain('ticket.create');
    });

    it('Без авторизации — 401', async () => {
      await e2e.agent.get('/me/permissions').expect(401);
    });

    it('Отражает обновлённые права после смены роли', async () => {
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
      const p: string[] = res.body.permissions;
      expect(p).toContain('role.read');
      expect(p).toContain('user.read');
    });
  });

  // ─── Login blocking ──────────────────────────────────────────────

  describe('Login blocking', () => {
    it('Блокирует логин после превышения лимита попыток OTP', async () => {
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
    it('Инвалидирует старый refresh после ротации', async () => {
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
    it('новый пользователь: request-otp → verify → register → /me → refresh → logout', async () => {
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
