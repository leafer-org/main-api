import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
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

/**
 * Per-user unread cursor (refactor-4): два сотрудника А и Б одной орг
 * имеют независимые счётчики. Клиент пишет — у обоих unread=1.
 * Один читает — у него 0, у другого по-прежнему 1.
 *
 * `chat.read` идёт через outbox → Kafka → ChatReadProjectionHandler,
 * поэтому unread-summary опрашивается с polling'ом.
 */
describe('chat — per-user shared-inbox unread', () => {
  let e2e: E2eApp;
  let dbPool: pg.Pool;

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

    dbPool = new pg.Pool({ connectionString: process.env.DB_URL });
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
    await dbPool?.end();
    await e2e?.app.close();
    await stopContainers();
  });

  /**
   * Прямой INSERT в `chat_organization_members` — обходит асинхронную
   * Kafka-проекцию `organization.respondability-changed`. Нужно
   * сэмулировать состояние «user — member организации» детерминированно.
   */
  async function addOrgMember(orgId: string, userId: string) {
    const db = drizzle({ client: dbPool });
    await db.execute(sql`
      INSERT INTO chat_organization_members (organization_id, user_id, joined_at)
      VALUES (${orgId}, ${userId}, NOW())
      ON CONFLICT DO NOTHING
    `);
  }

  async function getUnreadFor(token: string): Promise<number> {
    const res = await e2e.agent
      .get('/chats/unread-summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.totalUnreadCount as number;
  }

  async function waitForUnread(token: string, expected: number, timeoutMs = 8000): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    let last = -1;
    while (Date.now() < deadline) {
      last = await getUnreadFor(token);
      if (last === expected) return last;
      await new Promise((r) => setTimeout(r, 200));
    }
    return last;
  }

  it('два сотрудника видят независимые unread; mark-read одного не влияет на другого', async () => {
    // 1) owner + client + второй сотрудник B
    const owner = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000050',
      fullName: 'Owner A',
    });
    const employeeB = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000051',
      fullName: 'Employee B',
    });
    const org = await createOrganization(e2e.agent, owner.accessToken, { name: 'Org' });
    const client = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000052',
      fullName: 'Client',
    });

    // 2) Клиент пишет в орг (создаётся чат + первое сообщение).
    const open = await e2e.agent
      .post('/chats')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ organizationId: org.id, message: { text: 'Здравствуйте', mediaIds: [] } })
      .expect(200);
    const chatId = open.body.chatId as string;

    // 3) Ждём пока projection догонит для owner — иначе наша ручная
    // вставка employeeB будет затёрта при следующем DELETE+INSERT diff.
    const aBefore = await waitForUnread(owner.accessToken, 1);
    expect(aBefore).toBe(1);

    // 4) Теперь вручную добавляем B как member — он не respondable
    // (мы не инвайтили), поэтому проекция дальше его не тронет.
    await addOrgMember(org.id, employeeB.userId);

    const bBefore = await getUnreadFor(employeeB.accessToken);
    expect(bBefore).toBe(1);

    // 5) owner отмечает прочитанным. chat.read идёт через outbox → kafka → handler.
    // Узнаём messageId из admin-инбокса.
    const adminList = await e2e.agent
      .get('/admin/chats')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    const ownerChat = adminList.body.chats.find((c: { chatId: string }) => c.chatId === chatId);
    expect(ownerChat).toBeDefined();
    const lastMessageId = ownerChat.lastMessage.messageId as string;

    await e2e.agent
      .post(`/chats/${chatId}/read`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ upToMessageId: lastMessageId })
      .expect(204);

    // 6) Owner — счётчик становится 0 (poll'ом, ждём projection).
    const aAfter = await waitForUnread(owner.accessToken, 0);
    expect(aAfter).toBe(0);

    // 7) Employee B — счётчик остался 1 (не влияет на него).
    const bAfter = await getUnreadFor(employeeB.accessToken);
    expect(bAfter).toBe(1);
  }, 30_000);
});
