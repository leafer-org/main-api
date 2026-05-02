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

describe('idp-roles', () => {
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

  // ─── GET /roles ─────────────────────────────────────────────────────

  describe('GET /roles', () => {
    it('Возвращает список ролей админу', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .get('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.roles).toBeInstanceOf(Array);
      expect(res.body.roles.length).toBeGreaterThanOrEqual(2);

      const names = res.body.roles.map((r: { name: string }) => r.name);
      expect(names).toContain('ADMIN');
      expect(names).toContain('USER');
    });

    it('Без авторизации — 401', async () => {
      await e2e.agent.get('/roles').expect(401);
    });

    it('Без права manageRole — 403', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent.get('/roles').set('Authorization', `Bearer ${accessToken}`).expect(403);
    });
  });

  // ─── GET /roles/permissions-schema ──────────────────────────────────

  describe('GET /roles/permissions-schema', () => {
    it('Возвращает схему прав', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .get('/roles/permissions-schema')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body.groups)).toBe(true);
      expect(res.body.groups.length).toBeGreaterThan(0);

      const group = res.body.groups[0];
      expect(group).toHaveProperty('id');
      expect(group).toHaveProperty('title');
      expect(Array.isArray(group.permissions)).toBe(true);
      const permission = group.permissions[0];
      expect(permission).toHaveProperty('id');
      expect(permission).toHaveProperty('title');
      expect(permission).toHaveProperty('description');
    });
  });

  // ─── GET /roles/:roleId ────────────────────────────────────────────

  describe('GET /roles/:roleId', () => {
    it('Возвращает роль по ID', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Get list to find a real role ID
      const listRes = await e2e.agent
        .get('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const adminRole = listRes.body.roles.find((r: { name: string }) => r.name === 'ADMIN');

      const res = await e2e.agent
        .get(`/roles/${adminRole.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: adminRole.id,
        name: 'ADMIN',
        isStatic: true,
      });
      expect(res.body).toHaveProperty('permissions');
      expect(res.body).toHaveProperty('createdAt');
      expect(res.body).toHaveProperty('updatedAt');
    });

    it('Несуществующая роль — 404', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .get('/roles/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  // ─── POST /roles ───────────────────────────────────────────────────

  describe('POST /roles', () => {
    it('Создаёт новую роль', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'MODERATOR', permissions: ['role.read'] })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'MODERATOR',
        permissions: ['role.read'],
        isStatic: false,
      });
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('createdAt');
    });

    it('Дублирующее имя роли — 400', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Create role
      await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'MODERATOR', permissions: [] })
        .expect(201);

      // Try duplicate
      const res = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'MODERATOR', permissions: [] })
        .expect(400);

      expect(res.body.type).toBe('role_already_exists');
    });
  });

  // ─── Permission validation ─────────────────────────────────────────

  describe('Permission validation', () => {
    it('Создание роли с неизвестным правом — 400', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'BAD_ROLE', permissions: ['fake.key'] })
        .expect(400);

      expect(res.body.type).toBe('invalid_permissions');
      expect(res.body.data.errors).toContain('Unknown permission: fake.key');
    });

    it('Возвращает 400 со списком всех ошибок при нескольких невалидных правах', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'BAD_ROLE',
          permissions: ['unknown.one', 'unknown.two'],
        })
        .expect(400);

      expect(res.body.type).toBe('invalid_permissions');
      expect(res.body.data.errors).toHaveLength(2);
    });

    it('Обновление роли с невалидными правами — 400', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Create a valid role first
      const createRes = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'VALID_ROLE', permissions: [] })
        .expect(201);

      const roleId = createRes.body.id;

      const res = await e2e.agent
        .patch(`/roles/${roleId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ permissions: ['fake.key'] })
        .expect(400);

      expect(res.body.type).toBe('invalid_permissions');
    });

    it('Создаёт роль с корректным набором прав', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'VALID_MODERATOR',
          permissions: ['role.read', 'cms.category.read', 'session.read.all'],
        })
        .expect(201);
    });
  });

  // ─── POST /roles → assign → verify /me/permissions ─────────────────

  describe('Custom role permissions flow', () => {
    it('Применяет права кастомной роли к назначенному пользователю', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Create custom role with specific permissions
      const createRes = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'MODERATOR',
          permissions: ['cms.category.read', 'review.moderate', 'organization.info.moderate'],
        })
        .expect(201);

      const customRoleId = createRes.body.id;

      // Register a regular user
      const { userId } = await registerUser(e2e.agent, FIXED_OTP);

      // Assign custom role
      await e2e.agent
        .patch(`/users/${userId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId: customRoleId })
        .expect(200);

      // Re-login as the user (session invalidated by role change)
      await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: '+79990000002' })
        .expect(200);

      const verifyRes = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: '+79990000002', code: FIXED_OTP })
        .expect(200);

      const userToken = verifyRes.body.accessToken as string;

      // Verify permissions reflect the custom role
      const permRes = await e2e.agent
        .get('/me/permissions')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const p: string[] = permRes.body.permissions;
      expect(p).toEqual(
        expect.arrayContaining(['cms.category.read', 'review.moderate', 'organization.info.moderate']),
      );
      // Не должно быть прав, не выданных роли
      expect(p).not.toContain('role.create');
      expect(p).not.toContain('user.read');
    });

    it('Отражает изменения прав после обновления роли', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Create role with no permissions
      const createRes = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'EDITOR', permissions: [] })
        .expect(201);

      const roleId = createRes.body.id;

      // Register user and assign the role
      const { userId } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .patch(`/users/${userId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId })
        .expect(200);

      // Update the role to add permissions
      await e2e.agent
        .patch(`/roles/${roleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ permissions: ['cms.category.read', 'ticket.read'] })
        .expect(200);

      // Re-login as user
      await e2e.agent
        .post('/auth/request-otp')
        .send({ phoneNumber: '+79990000002' })
        .expect(200);

      const verifyRes = await e2e.agent
        .post('/auth/verify-otp')
        .send({ phoneNumber: '+79990000002', code: FIXED_OTP })
        .expect(200);

      const userToken = verifyRes.body.accessToken as string;

      const permRes = await e2e.agent
        .get('/me/permissions')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const p: string[] = permRes.body.permissions;
      expect(p).toContain('cms.category.read');
      expect(p).toContain('ticket.read');
      expect(p).not.toContain('role.create');
    });
  });

  // ─── PATCH /roles/:roleId ─────────────────────────────────────────

  describe('PATCH /roles/:roleId', () => {
    it('Обновляет права роли', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Create a non-static role first
      const createRes = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'EDITOR', permissions: [] })
        .expect(201);

      const roleId = createRes.body.id;

      const res = await e2e.agent
        .patch(`/roles/${roleId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ permissions: ['role.read'] })
        .expect(200);

      expect(res.body).toMatchObject({
        id: roleId,
        permissions: ['role.read'],
      });
    });

    it('Несуществующая роль — 404', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .patch('/roles/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ permissions: [] })
        .expect(404);
    });

    it('Обновление статической роли — 403', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Get ADMIN role (static)
      const listRes = await e2e.agent
        .get('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const adminRole = listRes.body.roles.find((r: { name: string }) => r.name === 'ADMIN');

      const res = await e2e.agent
        .patch(`/roles/${adminRole.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ permissions: ['role.read'] })
        .expect(403);

      expect(res.body.type).toBe('static_role_modification');
    });
  });

  // ─── DELETE /roles/:roleId ─────────────────────────────────────────

  describe('DELETE /roles/:roleId', () => {
    it('Удаляет нестатическую роль', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Create a role to delete
      const createRes = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'TEMP_ROLE', permissions: [] })
        .expect(201);

      const roleId = createRes.body.id;

      // Get USER role ID as replacement
      const listRes = await e2e.agent
        .get('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const userRole = listRes.body.roles.find((r: { name: string }) => r.name === 'USER');

      await e2e.agent
        .delete(`/roles/${roleId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ replacementRoleId: userRole.id })
        .expect(200);

      // Verify role is deleted
      await e2e.agent
        .get(`/roles/${roleId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('Несуществующая роль — 404', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Get USER role ID as replacement
      const listRes = await e2e.agent
        .get('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const userRole = listRes.body.roles.find((r: { name: string }) => r.name === 'USER');

      await e2e.agent
        .delete('/roles/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ replacementRoleId: userRole.id })
        .expect(404);
    });

    it('Удаление статической роли — 403', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const listRes = await e2e.agent
        .get('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const adminRole = listRes.body.roles.find((r: { name: string }) => r.name === 'ADMIN');
      const userRole = listRes.body.roles.find((r: { name: string }) => r.name === 'USER');

      const res = await e2e.agent
        .delete(`/roles/${adminRole.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ replacementRoleId: userRole.id })
        .expect(403);

      expect(res.body.type).toBe('static_role_modification');
    });
  });

  // ─── PATCH /users/:userId/role ─────────────────────────────────────

  describe('PATCH /users/:userId/role', () => {
    it('Обновляет роль пользователя', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { userId } = await registerUser(e2e.agent, FIXED_OTP);

      // Get ADMIN role ID
      const listRes = await e2e.agent
        .get('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const adminRole = listRes.body.roles.find((r: { name: string }) => r.name === 'ADMIN');

      await e2e.agent
        .patch(`/users/${userId}/role`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ roleId: adminRole.id })
        .expect(200);
    });

    it('Несуществующая роль — 404', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { userId } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .patch(`/users/${userId}/role`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ roleId: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
    });

    it('Инвалидирует сессии после смены роли', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { accessToken: userToken, userId } = await registerUser(e2e.agent, FIXED_OTP);

      // Get a role to assign
      const listRes = await e2e.agent
        .get('/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const adminRole = listRes.body.roles.find((r: { name: string }) => r.name === 'ADMIN');

      // Update user's role
      await e2e.agent
        .patch(`/users/${userId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId: adminRole.id })
        .expect(200);

      // User's old token should be invalidated (session deleted)
      await e2e.agent.get('/me').set('Authorization', `Bearer ${userToken}`).expect(401);
    });

    it('Без права ROLE.MANAGE — 403', async () => {
      const { accessToken: userToken, userId } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .patch(`/users/${userId}/role`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roleId: '00000000-0000-0000-0000-000000000000' })
        .expect(403);
    });
  });

  // ─── DELETE /roles/:roleId (role reassignment) ─────────────────────

  describe('DELETE /roles/:roleId (reassignment)', () => {
    it('Переводит пользователей на роль-замену при удалении роли', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Create a custom role
      const createRes = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'TEMP_CUSTOM', permissions: [] })
        .expect(201);

      const customRoleId = createRes.body.id;

      // Register a user (they get USER role by default)
      const { userId } = await registerUser(e2e.agent, FIXED_OTP);

      // Assign user to the custom role
      await e2e.agent
        .patch(`/users/${userId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId: customRoleId })
        .expect(200);

      // Get USER role ID as replacement
      const listRes = await e2e.agent
        .get('/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const userRole = listRes.body.roles.find((r: { name: string }) => r.name === 'USER');

      // Delete custom role with USER as replacement
      await e2e.agent
        .delete(`/roles/${customRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ replacementRoleId: userRole.id })
        .expect(200);

      // Verify role is deleted
      await e2e.agent
        .get(`/roles/${customRoleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ─── Permission checks for role CRUD ───────────────────────────────

  describe('Permission checks', () => {
    it('POST /roles обычному пользователю — 403', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'BLOCKED', permissions: [] })
        .expect(403);
    });

    it('PATCH /roles/:roleId обычному пользователю — 403', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .patch('/roles/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ permissions: [] })
        .expect(403);
    });

    it('DELETE /roles/:roleId обычному пользователю — 403', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .delete('/roles/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ replacementRoleId: '00000000-0000-0000-0000-000000000001' })
        .expect(403);
    });
  });
});
