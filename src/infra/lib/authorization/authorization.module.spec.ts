/** biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: test describe to long */
import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthorizationModule } from './authorization.module.js';
import { PermissionGuard } from './permission.guard.js';
import { PermissionService } from './permission-service.js';
import { ManualPermissionsStore } from './permissions-store.js';
import { RequirePermission } from './require-permission.decorator.js';
import { BooleanPerm, EnumPerm } from './schema.js';
import { SessionContext, StaticSessionContext } from './session-context.js';

const testPerms = {
  canViewUsers: BooleanPerm('USERS.CAN_VIEW', false),
  canEditUsers: BooleanPerm('USERS.CAN_EDIT', false),
  canDeleteUsers: BooleanPerm('USERS.CAN_DELETE', false),
  accessLevel: EnumPerm('ACCESS.LEVEL', ['all', 'self', 'none'] as const, 'none'),
};

describe('AuthorizationModule Integration', () => {
  describe('Module registration', () => {
    it('should register module and provide PermissionService', async () => {
      const store = new ManualPermissionsStore((can) => ({
        ADMIN: [can(testPerms.canViewUsers)],
      }));
      const sessionContext = new StaticSessionContext('ADMIN');

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          AuthorizationModule.register({
            permissionsStore: store,
            sessionContext,
          }),
        ],
      }).compile();

      const permissionService = module.get(PermissionService);

      expect(permissionService).toBeDefined();
      expect(permissionService.can(testPerms.canViewUsers)).toBe(true);
    });

    it('should register module and provide PermissionGuard', async () => {
      const store = new ManualPermissionsStore(() => ({}));
      const sessionContext = new StaticSessionContext('USER');

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          AuthorizationModule.register({
            permissionsStore: store,
            sessionContext,
          }),
        ],
      }).compile();

      const guard = module.get(PermissionGuard);

      expect(guard).toBeDefined();
    });

    it('should export SessionContext and PermissionsStore', async () => {
      const store = new ManualPermissionsStore(() => ({}));
      const sessionContext = new StaticSessionContext('TEST_ROLE');

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          AuthorizationModule.register({
            permissionsStore: store,
            sessionContext,
          }),
        ],
      }).compile();

      const exportedSessionContext = module.get(SessionContext);

      expect(exportedSessionContext.getRole()).toBe('TEST_ROLE');
    });
  });

  describe('PermissionService with module', () => {
    let module: TestingModule;
    let permissionService: PermissionService;

    beforeEach(async () => {
      const store = new ManualPermissionsStore((can) => ({
        ADMIN: [
          can(testPerms.canViewUsers),
          can(testPerms.canEditUsers),
          can(testPerms.canDeleteUsers),
          can(testPerms.accessLevel, 'all'),
        ],
        MANAGER: [
          can(testPerms.canViewUsers),
          can(testPerms.canEditUsers),
          can(testPerms.canDeleteUsers, false),
          can(testPerms.accessLevel, 'self'),
        ],
        USER: [can(testPerms.canViewUsers), can(testPerms.accessLevel, 'self')],
        GUEST: [],
      }));

      module = await Test.createTestingModule({
        imports: [
          AuthorizationModule.register({
            permissionsStore: store,
            sessionContext: new StaticSessionContext('ADMIN'),
          }),
        ],
      }).compile();

      permissionService = module.get(PermissionService);
    });

    it('should check boolean permission for current role', () => {
      expect(permissionService.can(testPerms.canViewUsers)).toBe(true);
      expect(permissionService.can(testPerms.canDeleteUsers)).toBe(true);
    });

    it('should check boolean permission for specific role', () => {
      expect(permissionService.canLocal(testPerms.canDeleteUsers, 'ADMIN')).toBe(true);
      expect(permissionService.canLocal(testPerms.canDeleteUsers, 'MANAGER')).toBe(false);
      expect(permissionService.canLocal(testPerms.canDeleteUsers, 'USER')).toBe(false);
    });

    it('should check enum permission with where clause', () => {
      const canAccessAll = (level: string) => level === 'all';
      const canAccessSelf = (level: string) => level === 'all' || level === 'self';

      expect(permissionService.canLocal(testPerms.accessLevel, 'ADMIN', canAccessAll)).toBe(true);
      expect(permissionService.canLocal(testPerms.accessLevel, 'MANAGER', canAccessAll)).toBe(
        false,
      );
      expect(permissionService.canLocal(testPerms.accessLevel, 'MANAGER', canAccessSelf)).toBe(
        true,
      );
    });

    it('should return false for non-existent role', () => {
      expect(permissionService.canLocal(testPerms.canViewUsers, 'UNKNOWN_ROLE')).toBe(false);
    });

    it('should use default value when permission not set', () => {
      expect(permissionService.canLocal(testPerms.canEditUsers, 'GUEST')).toBe(false);
    });
  });

  describe('PermissionGuard with controller', () => {
    @Controller('test')
    class TestController {
      @Get('public')
      public publicRoute() {
        return { message: 'public' };
      }

      @Get('view-users')
      @UseGuards(PermissionGuard)
      @RequirePermission((can) => can(testPerms.canViewUsers))
      public viewUsers() {
        return { message: 'users list' };
      }

      @Get('edit-users')
      @UseGuards(PermissionGuard)
      @RequirePermission((can) => can(testPerms.canEditUsers))
      public editUsers() {
        return { message: 'edit users' };
      }

      @Get('delete-users')
      @UseGuards(PermissionGuard)
      @RequirePermission((can) => can(testPerms.canDeleteUsers))
      public deleteUsers() {
        return { message: 'delete users' };
      }
    }

    async function createTestApp(role: string) {
      const store = new ManualPermissionsStore((can) => ({
        ADMIN: [
          can(testPerms.canViewUsers),
          can(testPerms.canEditUsers),
          can(testPerms.canDeleteUsers),
        ],
        USER: [can(testPerms.canViewUsers)],
      }));

      const module = await Test.createTestingModule({
        imports: [
          AuthorizationModule.register({
            permissionsStore: store,
            sessionContext: new StaticSessionContext(role),
          }),
        ],
        controllers: [TestController],
      }).compile();

      const app = module.createNestApplication();
      await app.init();
      return app;
    }

    it('should allow access to public routes', async () => {
      const app = await createTestApp('GUEST');

      const response = await request(app.getHttpServer()).get('/test/public');

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toEqual({ message: 'public' });

      await app.close();
    });

    it('should allow access when user has permission', async () => {
      const app = await createTestApp('ADMIN');

      const response = await request(app.getHttpServer()).get('/test/view-users');

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toEqual({ message: 'users list' });

      await app.close();
    });

    it('should deny access when user lacks permission', async () => {
      const app = await createTestApp('USER');

      const response = await request(app.getHttpServer()).get('/test/edit-users');

      expect(response.status).toBe(HttpStatus.FORBIDDEN);

      await app.close();
    });

    it('should allow partial permissions based on role', async () => {
      const app = await createTestApp('USER');

      const viewResponse = await request(app.getHttpServer()).get('/test/view-users');
      expect(viewResponse.status).toBe(HttpStatus.OK);

      const deleteResponse = await request(app.getHttpServer()).get('/test/delete-users');
      expect(deleteResponse.status).toBe(HttpStatus.FORBIDDEN);

      await app.close();
    });
  });

  describe('PermissionGuard with class-level decorator', () => {
    @Controller('protected')
    @UseGuards(PermissionGuard)
    @RequirePermission((can) => can(testPerms.canViewUsers))
    class ProtectedController {
      @Get()
      public index() {
        return { message: 'protected index' };
      }

      @Get('admin')
      @RequirePermission((can) => can(testPerms.canDeleteUsers))
      public adminOnly() {
        return { message: 'admin only' };
      }
    }

    async function createTestApp(role: string) {
      const store = new ManualPermissionsStore((can) => ({
        ADMIN: [can(testPerms.canViewUsers), can(testPerms.canDeleteUsers)],
        USER: [can(testPerms.canViewUsers)],
      }));

      const module = await Test.createTestingModule({
        imports: [
          AuthorizationModule.register({
            permissionsStore: store,
            sessionContext: new StaticSessionContext(role),
          }),
        ],
        controllers: [ProtectedController],
      }).compile();

      const app = module.createNestApplication();
      await app.init();
      return app;
    }

    it('should apply class-level permission decorator', async () => {
      const app = await createTestApp('GUEST');

      const response = await request(app.getHttpServer()).get('/protected');

      expect(response.status).toBe(HttpStatus.FORBIDDEN);

      await app.close();
    });

    it('should override class-level with method-level permission', async () => {
      const app = await createTestApp('USER');

      const indexResponse = await request(app.getHttpServer()).get('/protected');
      expect(indexResponse.status).toBe(HttpStatus.OK);

      const adminResponse = await request(app.getHttpServer()).get('/protected/admin');
      expect(adminResponse.status).toBe(HttpStatus.FORBIDDEN);

      await app.close();
    });

    it('should allow admin to access all routes', async () => {
      const app = await createTestApp('ADMIN');

      const indexResponse = await request(app.getHttpServer()).get('/protected');
      expect(indexResponse.status).toBe(HttpStatus.OK);

      const adminResponse = await request(app.getHttpServer()).get('/protected/admin');
      expect(adminResponse.status).toBe(HttpStatus.OK);

      await app.close();
    });
  });

  describe('PermissionGuard with enum permissions', () => {
    @Controller('data')
    class DataController {
      @Get('all')
      @UseGuards(PermissionGuard)
      @RequirePermission((can) => can(testPerms.accessLevel, (level) => level === 'all'))
      public getAllData() {
        return { data: 'all data' };
      }

      @Get('self')
      @UseGuards(PermissionGuard)
      @RequirePermission((can) =>
        can(testPerms.accessLevel, (level) => level === 'all' || level === 'self'),
      )
      public getSelfData() {
        return { data: 'self data' };
      }
    }

    async function createTestApp(role: string) {
      const store = new ManualPermissionsStore((can) => ({
        ADMIN: [can(testPerms.accessLevel, 'all')],
        USER: [can(testPerms.accessLevel, 'self')],
        GUEST: [can(testPerms.accessLevel, 'none')],
      }));

      const module = await Test.createTestingModule({
        imports: [
          AuthorizationModule.register({
            permissionsStore: store,
            sessionContext: new StaticSessionContext(role),
          }),
        ],
        controllers: [DataController],
      }).compile();

      const app = module.createNestApplication();
      await app.init();
      return app;
    }

    it('should allow admin to access all data', async () => {
      const app = await createTestApp('ADMIN');

      const allResponse = await request(app.getHttpServer()).get('/data/all');
      expect(allResponse.status).toBe(HttpStatus.OK);

      const selfResponse = await request(app.getHttpServer()).get('/data/self');
      expect(selfResponse.status).toBe(HttpStatus.OK);

      await app.close();
    });

    it('should allow user to access only self data', async () => {
      const app = await createTestApp('USER');

      const allResponse = await request(app.getHttpServer()).get('/data/all');
      expect(allResponse.status).toBe(HttpStatus.FORBIDDEN);

      const selfResponse = await request(app.getHttpServer()).get('/data/self');
      expect(selfResponse.status).toBe(HttpStatus.OK);

      await app.close();
    });

    it('should deny guest access to all data routes', async () => {
      const app = await createTestApp('GUEST');

      const allResponse = await request(app.getHttpServer()).get('/data/all');
      expect(allResponse.status).toBe(HttpStatus.FORBIDDEN);

      const selfResponse = await request(app.getHttpServer()).get('/data/self');
      expect(selfResponse.status).toBe(HttpStatus.FORBIDDEN);

      await app.close();
    });
  });

  describe('PermissionGuard with multiple permissions', () => {
    @Controller('multi')
    class MultiController {
      @Get('all')
      @UseGuards(PermissionGuard)
      @RequirePermission((can) => can(testPerms.canViewUsers) && can(testPerms.canEditUsers))
      public requireAll() {
        return { message: 'has all permissions' };
      }

      @Get('any')
      @UseGuards(PermissionGuard)
      @RequirePermission((can) => can(testPerms.canEditUsers) || can(testPerms.canDeleteUsers))
      public requireAny() {
        return { message: 'has any permission' };
      }
    }

    async function createTestApp(role: string) {
      const store = new ManualPermissionsStore((can) => ({
        ADMIN: [
          can(testPerms.canViewUsers),
          can(testPerms.canEditUsers),
          can(testPerms.canDeleteUsers),
        ],
        EDITOR: [can(testPerms.canViewUsers), can(testPerms.canEditUsers)],
        VIEWER: [can(testPerms.canViewUsers)],
      }));

      const module = await Test.createTestingModule({
        imports: [
          AuthorizationModule.register({
            permissionsStore: store,
            sessionContext: new StaticSessionContext(role),
          }),
        ],
        controllers: [MultiController],
      }).compile();

      const app = module.createNestApplication();
      await app.init();
      return app;
    }

    it('should require all permissions with AND', async () => {
      const adminApp = await createTestApp('ADMIN');
      expect((await request(adminApp.getHttpServer()).get('/multi/all')).status).toBe(
        HttpStatus.OK,
      );
      await adminApp.close();

      const editorApp = await createTestApp('EDITOR');
      expect((await request(editorApp.getHttpServer()).get('/multi/all')).status).toBe(
        HttpStatus.OK,
      );
      await editorApp.close();

      const viewerApp = await createTestApp('VIEWER');
      expect((await request(viewerApp.getHttpServer()).get('/multi/all')).status).toBe(
        HttpStatus.FORBIDDEN,
      );
      await viewerApp.close();
    });

    it('should require any permission with OR', async () => {
      const adminApp = await createTestApp('ADMIN');
      expect((await request(adminApp.getHttpServer()).get('/multi/any')).status).toBe(
        HttpStatus.OK,
      );
      await adminApp.close();

      const editorApp = await createTestApp('EDITOR');
      expect((await request(editorApp.getHttpServer()).get('/multi/any')).status).toBe(
        HttpStatus.OK,
      );
      await editorApp.close();

      const viewerApp = await createTestApp('VIEWER');
      expect((await request(viewerApp.getHttpServer()).get('/multi/any')).status).toBe(
        HttpStatus.FORBIDDEN,
      );
      await viewerApp.close();
    });
  });

  describe('Global guard registration', () => {
    @Controller('global')
    class GlobalController {
      @Get('public')
      public publicRoute() {
        return { message: 'public' };
      }

      @Get('protected')
      @RequirePermission((can) => can(testPerms.canViewUsers))
      public protectedRoute() {
        return { message: 'protected' };
      }
    }

    it('should work with APP_GUARD provider', async () => {
      const store = new ManualPermissionsStore((can) => ({
        USER: [can(testPerms.canViewUsers)],
      }));

      const module = await Test.createTestingModule({
        imports: [
          AuthorizationModule.register({
            permissionsStore: store,
            sessionContext: new StaticSessionContext('USER'),
          }),
        ],
        controllers: [GlobalController],
        providers: [
          {
            provide: APP_GUARD,
            useClass: PermissionGuard,
          },
        ],
      }).compile();

      const app = module.createNestApplication();
      await app.init();

      const publicResponse = await request(app.getHttpServer()).get('/global/public');
      expect(publicResponse.status).toBe(HttpStatus.OK);

      const protectedResponse = await request(app.getHttpServer()).get('/global/protected');
      expect(protectedResponse.status).toBe(HttpStatus.OK);

      await app.close();
    });

    it('should deny access with APP_GUARD when permission missing', async () => {
      const store = new ManualPermissionsStore(() => ({
        GUEST: [],
      }));

      const module = await Test.createTestingModule({
        imports: [
          AuthorizationModule.register({
            permissionsStore: store,
            sessionContext: new StaticSessionContext('GUEST'),
          }),
        ],
        controllers: [GlobalController],
        providers: [
          {
            provide: APP_GUARD,
            useClass: PermissionGuard,
          },
        ],
      }).compile();

      const app = module.createNestApplication();
      await app.init();

      const publicResponse = await request(app.getHttpServer()).get('/global/public');
      expect(publicResponse.status).toBe(HttpStatus.OK);

      const protectedResponse = await request(app.getHttpServer()).get('/global/protected');
      expect(protectedResponse.status).toBe(HttpStatus.FORBIDDEN);

      await app.close();
    });
  });
});
