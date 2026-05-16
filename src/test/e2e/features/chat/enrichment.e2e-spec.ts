import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { registerUser } from '../../actors/auth.js';
import { createOrganization } from '../../actors/organization.js';
import { startContainers, stopContainers } from '../../helpers/containers.js';
import { type E2eApp } from '../../helpers/create-app.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import { UserDirectoryPort } from '@/kernel/application/ports/user-directory.js';

const FIXED_OTP = '123456';

describe('chat — list enrichment (subject / assignedUser / senderUser)', () => {
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
    e2e = { app, agent: request(app.getHttpServer()) };
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

  async function setupClientAndOrg() {
    const owner = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000010',
      fullName: 'Org Owner',
    });
    const org = await createOrganization(e2e.agent, owner.accessToken, { name: 'Acme LLC' });
    const client = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000020',
      fullName: 'Иван Клиент',
    });
    return { owner, org, client };
  }

  async function openChat(token: string, orgId: string, text = 'Привет') {
    const res = await e2e.agent
      .post('/chats')
      .set('Authorization', `Bearer ${token}`)
      .send({ organizationId: orgId, message: { text, mediaIds: [] } })
      .expect(200);
    return res.body as { chatId: string };
  }

  describe('GET /chats — клиентский список', () => {
    it('возвращает participants с заполненным subject и senderUser в lastMessage', async () => {
      const { org, client } = await setupClientAndOrg();
      await openChat(client.accessToken, org.id, 'Здравствуйте');

      const res = await e2e.agent
        .get('/chats')
        .set('Authorization', `Bearer ${client.accessToken}`)
        .expect(200);

      const chat = res.body.chats[0];
      expect(chat).toBeDefined();
      expect(chat.participants).toHaveLength(2);

      const userSlot = chat.participants.find((p: any) => p.subject?.kind === 'user');
      const orgSlot = chat.participants.find((p: any) => p.subject?.kind === 'organization');

      expect(userSlot.subject).toMatchObject({
        kind: 'user',
        id: client.userId,
        fullName: 'Иван Клиент',
      });
      expect(userSlot.subject.avatarUrl).toBeNull(); // avatarId не задан
      expect(userSlot.assignedUser).toBeNull();

      expect(orgSlot.subject).toMatchObject({
        kind: 'organization',
        id: org.id,
      });
      // Орг ещё не опубликована → directory вернёт null → display-поля null.
      expect(orgSlot.subject.name).toBeNull();
      expect(orgSlot.subject.logoUrl).toBeNull();
      expect(orgSlot.assignedUser).toBeNull();

      expect(chat.lastMessage).not.toBeNull();
      expect(chat.lastMessage.senderUser).toMatchObject({
        kind: 'user',
        id: client.userId,
        fullName: 'Иван Клиент',
      });
    });
  });

  describe('GET /admin/chats — owner inbox', () => {
    it('owner видит subject клиента + assignedUser после claim', async () => {
      const { owner, org, client } = await setupClientAndOrg();
      const { chatId } = await openChat(client.accessToken, org.id, 'нужна помощь');

      // owner claim'ит + отвечает одной командой
      const reply = await e2e.agent
        .post(`/admin/chats/${chatId}/messages?claim=true`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ text: 'Здравствуйте!', mediaIds: [] })
        .expect(200);
      expect(reply.body.claimed).toBe(true);

      const list = await e2e.agent
        .get('/admin/chats?slotKind=organization')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      const chat = list.body.chats.find((c: any) => c.chatId === chatId);
      expect(chat).toBeDefined();

      const orgSlot = chat.participants.find((p: any) => p.subject?.kind === 'organization');
      expect(orgSlot.subject.id).toBe(org.id);
      expect(orgSlot.assignedUser).toMatchObject({
        kind: 'user',
        id: owner.userId,
        fullName: 'Org Owner',
      });

      const userSlot = chat.participants.find((p: any) => p.subject?.kind === 'user');
      expect(userSlot.subject).toMatchObject({
        kind: 'user',
        id: client.userId,
        fullName: 'Иван Клиент',
      });

      // lastMessage прислан owner'ом через org-slot → senderUser = owner
      expect(chat.lastMessage.senderUser).toMatchObject({
        kind: 'user',
        id: owner.userId,
        fullName: 'Org Owner',
      });
    });
  });
});

describe('chat — graceful enrichment failure', () => {
  let e2e: E2eApp;
  let failNext = false;

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

    // Подменяем `findByIds` на инстансе так, чтобы по флагу бросал ошибку.
    // findById не трогаем — это вызывает UserLookupPort для auth/profile.
    const userDirectory = app.get(UserDirectoryPort);
    const originalFindByIds = userDirectory.findByIds.bind(userDirectory);
    (userDirectory as { findByIds: typeof userDirectory.findByIds }).findByIds = async (
      ids,
    ) => {
      if (failNext) throw new Error('user-directory down');
      return originalFindByIds(ids);
    };

    e2e = { app, agent: request(app.getHttpServer()) };
  });

  beforeEach(async () => {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await seedStaticRoles(process.env.DB_URL);
    await seedAdminUser(process.env.DB_URL);
  });

  afterEach(async () => {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await truncateAll(process.env.DB_URL);
    failNext = false;
  });

  afterAll(async () => {
    await e2e?.app.close();
    await stopContainers();
  });

  it('возвращает 200 с subject={kind,id} и display-полями=null когда UserDirectory упал', async () => {
    const owner = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000030',
      fullName: 'Org Owner',
    });
    const org = await createOrganization(e2e.agent, owner.accessToken, { name: 'Acme LLC' });
    const client = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000040',
      fullName: 'Иван Клиент',
    });

    await e2e.agent
      .post('/chats')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ organizationId: org.id, message: { text: 'Привет', mediaIds: [] } })
      .expect(200);

    failNext = true;

    const res = await e2e.agent
      .get('/chats')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    const chat = res.body.chats[0];
    expect(chat).toBeDefined();
    expect(chat.participants).toHaveLength(2);

    const userSlot = chat.participants.find((p: any) => p.subject?.kind === 'user');
    expect(userSlot.subject).toEqual({
      kind: 'user',
      id: client.userId,
      fullName: null,
      avatarUrl: null,
    });

    // lastMessage.senderUser тоже без display-полей, только { kind, id }.
    expect(chat.lastMessage.senderUser).toEqual({
      kind: 'user',
      id: client.userId,
      fullName: null,
      avatarUrl: null,
    });
  });
});
