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

const FIXED_OTP = '123456';

describe('chat — search', () => {
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
  }, 120_000);

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

  async function waitForOperatorPool(token: string): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < 15_000) {
      const r = await e2e.agent
        .get('/admin/chats/search')
        .query({ q: '__probe__' })
        .set('Authorization', `Bearer ${token}`);
      if (r.status === 200) return;
      await new Promise((res) => setTimeout(res, 200));
    }
    throw new Error('waitForOperatorPool: timeout');
  }

  async function setup() {
    const owner = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990001001',
      fullName: 'Owner',
    });
    const org = await createOrganization(e2e.agent, owner.accessToken, { name: 'Search Org' });
    const client = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990001002',
      fullName: 'Client',
    });
    const stranger = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990001003',
      fullName: 'Stranger',
    });
    return { owner, org, client, stranger };
  }

  async function openChat(token: string, orgId: string, text: string) {
    const r = await e2e.agent
      .post('/chats')
      .set('Authorization', `Bearer ${token}`)
      .send({ organizationId: orgId, message: { text, mediaIds: [] } })
      .expect(200);
    return r.body.chatId as string;
  }

  async function sendUserMessage(token: string, chatId: string, text: string) {
    await e2e.agent
      .post(`/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text, mediaIds: [] })
      .expect(200);
  }

  it('q < 2 символов — 400 query_too_short', async () => {
    const client = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990001100',
      fullName: 'Client',
    });

    const res = await e2e.agent
      .get('/chats/search')
      .query({ q: 'a' })
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(400);
    expect(res.body.type).toBe('query_too_short');
  });

  it('Глобальный поиск по моим чатам: возвращает совпадение с highlight и snippet', async () => {
    const { org, client } = await setup();
    await openChat(client.accessToken, org.id, 'Привет, нужна доставка курьером');
    await openChat(
      await (async () => {
        const u = await registerUser(e2e.agent, FIXED_OTP, {
          phone: '+79990001102',
          fullName: 'Other',
        });
        return u.accessToken;
      })(),
      org.id,
      'Здравствуйте, обычное сообщение',
    );

    const res = await e2e.agent
      .get('/chats/search')
      .query({ q: 'доставка' })
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    expect(res.body.results).toHaveLength(1);
    const hit = res.body.results[0];
    expect(hit.snippet).toMatch(/доставка/i);
    expect(hit.highlightedText).toMatch(/<mark>/);
    expect(hit.chatPreview).toBeDefined();
    expect(hit.chatPreview.partyOther.kind).toBe('organization');
    expect(hit.chatPreview.partyOther.subjectId).toBe(org.id);
    expect(res.body.nextCursor).toBeNull();
  });

  it('Удалённое сообщение не возвращается', async () => {
    const { org, client } = await setup();
    const chatId = await openChat(client.accessToken, org.id, 'уникальное_слово_xyz123');

    // Удаляем сообщение клиента (которое было первым)
    const list = await e2e.agent
      .get(`/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);
    const messageId = list.body.messages[0].messageId;
    await e2e.agent
      .delete(`/chats/${chatId}/messages/${messageId}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(204);

    const res = await e2e.agent
      .get('/chats/search')
      .query({ q: 'уникальное_слово_xyz123' })
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    expect(res.body.results).toEqual([]);
  });

  it('Поиск в чужом чате — 404 chat_not_found', async () => {
    const { org, client, stranger } = await setup();
    const chatId = await openChat(client.accessToken, org.id, 'сообщение для теста');

    const res = await e2e.agent
      .get(`/chats/${chatId}/search`)
      .query({ q: 'сообщение' })
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .expect(404);
    expect(res.body.type).toBe('chat_not_found');
  });

  it('Поиск в моём чате — возвращает только из этого чата', async () => {
    const { org, client } = await setup();
    const chat1 = await openChat(client.accessToken, org.id, 'первый чат: сообщение_альфа');

    const otherClient = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990001104',
      fullName: 'Other Client',
    });
    await openChat(otherClient.accessToken, org.id, 'другой чат: сообщение_альфа тоже');

    await sendUserMessage(client.accessToken, chat1, 'ещё одно сообщение_альфа');

    const res = await e2e.agent
      .get(`/chats/${chat1}/search`)
      .query({ q: 'сообщение_альфа' })
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    expect(res.body.results.length).toBe(2);
    for (const hit of res.body.results) {
      expect(hit.chatId).toBe(chat1);
    }
  });

  it('Operator search: owner ищет в своих org-чатах', async () => {
    const { owner, org, client } = await setup();
    await openChat(client.accessToken, org.id, 'нужна срочная_отправка_сегодня');
    await waitForOperatorPool(owner.accessToken);

    const res = await e2e.agent
      .get('/admin/chats/search')
      .query({ q: 'срочная_отправка_сегодня' })
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(res.body.results.length).toBe(1);
    expect(res.body.results[0].chatPreview.partyOther.kind).toBe('user');
  });

  it('Operator search: пользователь без operator-pool — 403 no_chat_access', async () => {
    const { stranger } = await setup();
    const res = await e2e.agent
      .get('/admin/chats/search')
      .query({ q: 'что-то' })
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .expect(403);
    expect(res.body.type).toBe('no_chat_access');
  });

  it('Невалидный cursor — 400 invalid_cursor', async () => {
    const client = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990001200',
      fullName: 'Cursor User',
    });
    const res = await e2e.agent
      .get('/chats/search')
      .query({ q: 'тест', cursor: 'not_base64_!!!' })
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(400);
    expect(res.body.type).toBe('invalid_cursor');
  });
});
