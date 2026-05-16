import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loginAsAdmin, registerUser } from '../../actors/auth.js';
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

describe('chat — full flow', () => {
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

  // ─── helpers ─────────────────────────────────────────────────

  async function setupClientAndOrgOwner() {
    const owner = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000010',
      fullName: 'Owner',
    });
    const org = await createOrganization(e2e.agent, owner.accessToken, { name: 'Org' });
    const client = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000020',
      fullName: 'Client',
    });
    return { owner, org, client };
  }

  async function openChat(token: string, orgId: string, text = 'Hello') {
    const res = await e2e.agent
      .post('/chats')
      .set('Authorization', `Bearer ${token}`)
      .send({ organizationId: orgId, message: { text, mediaIds: [] } })
      .expect(200);
    return res.body as { chatId: string; reused: boolean };
  }

  // ─── Operator flow ───────────────────────────────────────────

  describe('Operator-side claim + send (?claim=true)', () => {
    it('owner claims and replies in one shot', async () => {
      const { owner, org, client } = await setupClientAndOrgOwner();
      const { chatId } = await openChat(client.accessToken, org.id);

      const sendRes = await e2e.agent
        .post(`/admin/chats/${chatId}/messages?claim=true`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ text: 'Здравствуйте!', mediaIds: [] });
      if (sendRes.status !== 200) {
        // eslint-disable-next-line no-console
        console.log('owner claim+send FAIL', sendRes.status, JSON.stringify(sendRes.body));
      }
      expect(sendRes.status).toBe(200);

      expect(sendRes.body.claimed).toBe(true);
      expect(sendRes.body.messageId).toBeDefined();
    });

    it('rejects send without claim if slot unclaimed', async () => {
      const { owner, org, client } = await setupClientAndOrgOwner();
      const { chatId } = await openChat(client.accessToken, org.id);

      const res = await e2e.agent
        .post(`/admin/chats/${chatId}/messages`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ text: 'no claim', mediaIds: [] })
        .expect(403);
      expect(res.body.type).toBe('not_a_chat_responder');
    });
  });

  // ─── Send / edit / delete (user-side) ────────────────────────

  describe('User-side send/edit/delete', () => {
    it('user sends second message, then edits, then deletes', async () => {
      const { org, client } = await setupClientAndOrgOwner();
      const { chatId } = await openChat(client.accessToken, org.id);

      const sendRes = await e2e.agent
        .post(`/chats/${chatId}/messages`)
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({ text: 'Второе', mediaIds: [] })
        .expect(200);
      const messageId = sendRes.body.messageId as string;

      await e2e.agent
        .patch(`/chats/${chatId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({ text: 'Отредактировано', mediaIds: [] })
        .expect(204);

      await e2e.agent
        .delete(`/chats/${chatId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${client.accessToken}`)
        .expect(204);
    });

    it('rejects edit of foreign message', async () => {
      const { owner, org, client } = await setupClientAndOrgOwner();
      const { chatId } = await openChat(client.accessToken, org.id);

      // owner claims and sends so we have an owner-authored message
      const ownerSend = await e2e.agent
        .post(`/admin/chats/${chatId}/messages?claim=true`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ text: 'Привет', mediaIds: [] })
        .expect(200);

      // client tries to edit owner's message
      const res = await e2e.agent
        .patch(`/chats/${chatId}/messages/${ownerSend.body.messageId}`)
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({ text: 'хак', mediaIds: [] })
        .expect(403);
      expect(res.body.type).toBe('not_message_author');
    });
  });

  // ─── List / detail / history / unread ────────────────────────

  describe('Lists and reads', () => {
    it('GET /chats returns my chats with last message preview', async () => {
      const { org, client } = await setupClientAndOrgOwner();
      const { chatId } = await openChat(client.accessToken, org.id, 'Привет');

      const res = await e2e.agent
        .get('/chats')
        .set('Authorization', `Bearer ${client.accessToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.chats[0].chatId).toBe(chatId);
      expect(res.body.chats[0].lastMessage.preview).toBe('Привет');
    });

    it('GET /chats/:chatId/messages returns history with cursor', async () => {
      const { org, client } = await setupClientAndOrgOwner();
      const { chatId } = await openChat(client.accessToken, org.id);

      // Send a few more
      for (let i = 0; i < 3; i++) {
        await e2e.agent
          .post(`/chats/${chatId}/messages`)
          .set('Authorization', `Bearer ${client.accessToken}`)
          .send({ text: `m-${i}`, mediaIds: [] })
          .expect(200);
      }

      const res = await e2e.agent
        .get(`/chats/${chatId}/messages?limit=2`)
        .set('Authorization', `Bearer ${client.accessToken}`)
        .expect(200);

      expect(res.body.messages).toHaveLength(2);
      expect(res.body.nextCursor).not.toBeNull();
    });

    it('mark-read + unread-summary', async () => {
      const { owner, org, client } = await setupClientAndOrgOwner();
      const { chatId } = await openChat(client.accessToken, org.id);

      // owner replies
      const ownerSend = await e2e.agent
        .post(`/admin/chats/${chatId}/messages?claim=true`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ text: 'reply', mediaIds: [] })
        .expect(200);

      // client unread should be at least 1 (owner's reply)
      const before = await e2e.agent
        .get('/chats/unread-summary')
        .set('Authorization', `Bearer ${client.accessToken}`)
        .expect(200);
      expect(before.body.totalUnreadCount).toBeGreaterThanOrEqual(1);

      // mark read up to owner's message
      await e2e.agent
        .post(`/chats/${chatId}/read`)
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({ upToMessageId: ownerSend.body.messageId })
        .expect(204);

      // chat.read идёт через outbox → kafka → projection — ждём с polling.
      const deadline = Date.now() + 8000;
      let totalUnread = -1;
      while (Date.now() < deadline) {
        const after = await e2e.agent
          .get('/chats/unread-summary')
          .set('Authorization', `Bearer ${client.accessToken}`)
          .expect(200);
        totalUnread = after.body.totalUnreadCount;
        if (totalUnread === 0) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(totalUnread).toBe(0);
    });
  });

  // ─── Block / unblock ─────────────────────────────────────────

  describe('Block/unblock', () => {
    it('owner blocks chat, user gets 403 on send, owner unblocks', async () => {
      const { owner, org, client } = await setupClientAndOrgOwner();
      const { chatId } = await openChat(client.accessToken, org.id);
      await e2e.agent
        .post(`/admin/chats/${chatId}/messages?claim=true`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ text: 'taking it', mediaIds: [] })
        .expect(200);

      await e2e.agent
        .post(`/admin/chats/${chatId}/block`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ reason: 'spam' })
        .expect(204);

      const send = await e2e.agent
        .post(`/chats/${chatId}/messages`)
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({ text: 'try', mediaIds: [] })
        .expect(403);
      expect(send.body.type).toBe('chat_blocked');

      await e2e.agent
        .post(`/admin/chats/${chatId}/unblock`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(204);
    });

  });

  // ─── Reports ─────────────────────────────────────────────────

  describe('Reports', () => {
    it('client reports owner-authored message', async () => {
      const { owner, org, client } = await setupClientAndOrgOwner();
      const { chatId } = await openChat(client.accessToken, org.id);
      const ownerMsg = await e2e.agent
        .post(`/admin/chats/${chatId}/messages?claim=true`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ text: 'reply', mediaIds: [] })
        .expect(200);

      await e2e.agent
        .post(`/chats/${chatId}/messages/${ownerMsg.body.messageId}/report`)
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({ reason: 'inappropriate', category: 'abuse' })
        .expect(204);
    });

    it('cannot report own message', async () => {
      const { org, client } = await setupClientAndOrgOwner();
      const open = await openChat(client.accessToken, org.id);
      const sendRes = await e2e.agent
        .post(`/chats/${open.chatId}/messages`)
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({ text: 'mine', mediaIds: [] })
        .expect(200);
      const res = await e2e.agent
        .post(`/chats/${open.chatId}/messages/${sendRes.body.messageId}/report`)
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({ reason: 'self', category: null })
        .expect(400);
      expect(res.body.type).toBe('cannot_report_own_message');
    });
  });

  // ─── user → support flow ─────────────────────────────────────

  describe('User → Support', () => {
    it('user opens support chat via POST /chats/support', async () => {
      const { client } = await setupClientAndOrgOwner();
      const res = await e2e.agent
        .post('/chats/support')
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({ message: { text: 'нужна помощь', mediaIds: [] } })
        .expect(200);
      expect(res.body.chatId).toBeDefined();
    });

    it('admin replies via /admin/chats/:id/messages?claim=true', async () => {
      const { client } = await setupClientAndOrgOwner();
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const open = await e2e.agent
        .post('/chats/support')
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({ message: { text: 'нужна помощь', mediaIds: [] } })
        .expect(200);

      const reply = await e2e.agent
        .post(`/admin/chats/${open.body.chatId}/messages?claim=true`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ text: 'здравствуйте', mediaIds: [] })
        .expect(200);
      expect(reply.body.claimed).toBe(true);
    });
  });

  // ─── admin → user proactive ──────────────────────────────────

  describe('Admin → User proactive', () => {
    it('admin opens chat with user', async () => {
      const { client } = await setupClientAndOrgOwner();
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .post('/admin/chats')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          target: { kind: 'user', userId: client.userId },
          message: { text: 'привет от поддержки', mediaIds: [] },
        })
        .expect(200);
      expect(res.body.chatId).toBeDefined();
    });
  });
});
