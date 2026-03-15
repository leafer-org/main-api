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

describe('Roles Controller (e2e)', () => {
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
    it('should return list of roles for admin user', async () => {
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

    it('should return 401 without auth token', async () => {
      await e2e.agent.get('/roles').expect(401);
    });

    it('should return 403 for user without manageRole permission', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent.get('/roles').set('Authorization', `Bearer ${accessToken}`).expect(403);
    });
  });

  // ─── GET /roles/permissions-schema ──────────────────────────────────

  describe('GET /roles/permissions-schema', () => {
    it('should return permissions schema', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .get('/roles/permissions-schema')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThan(0);

      const item = res.body[0];
      expect(item).toHaveProperty('action');
      expect(item).toHaveProperty('key');
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('default');
    });
  });

  // ─── GET /roles/:roleId ────────────────────────────────────────────

  describe('GET /roles/:roleId', () => {
    it('should return role by ID', async () => {
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

    it('should return 404 for non-existent role', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .get('/roles/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  // ─── POST /roles ───────────────────────────────────────────────────

  describe('POST /roles', () => {
    it('should create a new role', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'MODERATOR', permissions: { 'ROLE.MANAGE': false } })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'MODERATOR',
        permissions: { 'ROLE.MANAGE': false },
        isStatic: false,
      });
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('createdAt');
    });

    it('should return 400 for duplicate role name', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Create role
      await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'MODERATOR', permissions: {} })
        .expect(201);

      // Try duplicate
      const res = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'MODERATOR', permissions: {} })
        .expect(400);

      expect(res.body.type).toBe('role_already_exists');
    });
  });

  // ─── Permission validation ─────────────────────────────────────────

  describe('Permission validation', () => {
    it('should return 400 when creating role with unknown permission key', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'BAD_ROLE', permissions: { 'FAKE.KEY': true } })
        .expect(400);

      expect(res.body.type).toBe('invalid_permissions');
      expect(res.body.data.errors).toContain('Unknown permission action: FAKE.KEY');
    });

    it('should return 400 when creating role with invalid boolean permission value', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'BAD_ROLE', permissions: { 'ROLE.MANAGE': 'yes' } })
        .expect(400);

      expect(res.body.type).toBe('invalid_permissions');
      expect(res.body.data.errors[0]).toMatch(/ROLE\.MANAGE.*boolean/);
    });

    it('should return 400 when creating role with invalid enum permission value', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'BAD_ROLE', permissions: { 'SESSION.MANAGE': 'invalid' } })
        .expect(400);

      expect(res.body.type).toBe('invalid_permissions');
      expect(res.body.data.errors[0]).toMatch(/SESSION\.MANAGE.*self.*all/);
    });

    it('should return 400 with multiple errors for multiple invalid permissions', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'BAD_ROLE',
          permissions: { 'UNKNOWN': true, 'ROLE.MANAGE': 123 },
        })
        .expect(400);

      expect(res.body.type).toBe('invalid_permissions');
      expect(res.body.data.errors).toHaveLength(2);
    });

    it('should return 400 when updating role with invalid permissions', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Create a valid role first
      const createRes = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'VALID_ROLE', permissions: {} })
        .expect(201);

      const roleId = createRes.body.id;

      const res = await e2e.agent
        .patch(`/roles/${roleId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ permissions: { 'FAKE.KEY': true } })
        .expect(400);

      expect(res.body.type).toBe('invalid_permissions');
    });

    it('should allow creating role with valid permissions', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'VALID_MODERATOR',
          permissions: {
            'ROLE.MANAGE': true,
            'CMS.MANAGE': false,
            'SESSION.MANAGE': 'all',
          },
        })
        .expect(201);
    });
  });

  // ─── POST /roles → assign → verify /me/permissions ─────────────────

  describe('Custom role permissions flow', () => {
    it('should apply custom role permissions to assigned user', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Create custom role with specific permissions
      const createRes = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'MODERATOR',
          permissions: {
            'CMS.MANAGE': true,
            'REVIEW.MODERATE': true,
            'ORGANIZATION.MODERATE': true,
          },
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

      const p = permRes.body.permissions;
      expect(p['CMS.MANAGE']).toBe(true);
      expect(p['REVIEW.MODERATE']).toBe(true);
      expect(p['ORGANIZATION.MODERATE']).toBe(true);
      // Other permissions should remain at defaults
      expect(p['ROLE.MANAGE']).toBe(false);
      expect(p['USER.MANAGE']).toBe(false);
      expect(p['SESSION.MANAGE']).toBe('self');
    });

    it('should reflect permission changes after role update', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Create role with no permissions
      const createRes = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'EDITOR', permissions: {} })
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
        .send({ permissions: { 'CMS.MANAGE': true, 'TICKET.MANAGE': true } })
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

      expect(permRes.body.permissions['CMS.MANAGE']).toBe(true);
      expect(permRes.body.permissions['TICKET.MANAGE']).toBe(true);
      expect(permRes.body.permissions['ROLE.MANAGE']).toBe(false);
    });
  });

  // ─── PATCH /roles/:roleId ─────────────────────────────────────────

  describe('PATCH /roles/:roleId', () => {
    it('should update role permissions', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Create a non-static role first
      const createRes = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'EDITOR', permissions: {} })
        .expect(201);

      const roleId = createRes.body.id;

      const res = await e2e.agent
        .patch(`/roles/${roleId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ permissions: { 'ROLE.MANAGE': true } })
        .expect(200);

      expect(res.body).toMatchObject({
        id: roleId,
        permissions: { 'ROLE.MANAGE': true },
      });
    });

    it('should return 404 for non-existent role', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .patch('/roles/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ permissions: {} })
        .expect(404);
    });

    it('should return 403 when updating static role', async () => {
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
        .send({ permissions: { 'ROLE.MANAGE': false } })
        .expect(403);

      expect(res.body.type).toBe('static_role_modification');
    });
  });

  // ─── DELETE /roles/:roleId ─────────────────────────────────────────

  describe('DELETE /roles/:roleId', () => {
    it('should delete a non-static role', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Create a role to delete
      const createRes = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'TEMP_ROLE', permissions: {} })
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

    it('should return 404 for non-existent role', async () => {
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

    it('should return 403 when deleting static role', async () => {
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
    it('should update user role', async () => {
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

    it('should return 404 for non-existent role', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { userId } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .patch(`/users/${userId}/role`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ roleId: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
    });

    it('should invalidate sessions after role change', async () => {
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

    it('should return 403 for regular user without ROLE.MANAGE', async () => {
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
    it('should reassign users to replacement role when deleting a role', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Create a custom role
      const createRes = await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'TEMP_CUSTOM', permissions: {} })
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
    it('should return 403 for regular user on POST /roles', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'BLOCKED', permissions: {} })
        .expect(403);
    });

    it('should return 403 for regular user on PATCH /roles/:roleId', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .patch('/roles/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ permissions: {} })
        .expect(403);
    });

    it('should return 403 for regular user on DELETE /roles/:roleId', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .delete('/roles/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ replacementRoleId: '00000000-0000-0000-0000-000000000001' })
        .expect(403);
    });
  });
});
