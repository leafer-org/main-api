import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { registerUser } from '../../actors/auth.js';
import { createOrganization } from '../../actors/organization.js';
import { startContainers, stopContainers } from '../../helpers/containers.js';
import { type E2eApp } from '../../helpers/create-app.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import { seedItemPublished } from '../../helpers/organization-seed.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import { ItemDirectoryPort } from '@/kernel/application/ports/item-directory.js';

const FIXED_OTP = '123456';

/**
 * Item-ref attachments на сообщениях — контекст товара живёт на сообщении,
 * не на чате. Один чат на пару (user, org), любые обращения по разным
 * товарам — разные сообщения с attachment'ами.
 */
describe('chat — item-ref attachments', () => {
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
    // ItemDirectoryPort кеширует результаты на 60с — сбрасываем,
    // иначе следующий тест увидит item из предыдущего truncate'нутого state.
    const itemDirectory = e2e.app.get(ItemDirectoryPort) as {
      clearCache?: () => void;
    };
    itemDirectory.clearCache?.();
  });

  afterAll(async () => {
    await e2e?.app.close();
    await stopContainers();
  });

  async function seedItem(orgId: string, title: string): Promise<string> {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    const itemId = randomUUID();
    await seedItemPublished(process.env.DB_URL, {
      id: itemId,
      organizationId: orgId,
      typeId: randomUUID(),
      widgets: [
        { type: 'base-info', title, description: 'desc', media: [] },
      ],
    });
    return itemId;
  }

  async function setup() {
    const owner = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000080',
      fullName: 'Owner',
    });
    const org = await createOrganization(e2e.agent, owner.accessToken, { name: 'Acme' });
    const client = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000081',
      fullName: 'Client',
    });
    return { owner, org, client };
  }

  it('sends first message with item-ref attachment; messages history returns it', async () => {
    const { org, client } = await setup();
    const itemId = await seedItem(org.id, 'Йога');

    const open = await e2e.agent
      .post('/chats')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({
        organizationId: org.id,
        message: {
          text: 'Расскажите про это',
          mediaIds: [],
          attachments: [{ kind: 'item-ref', itemId }],
        },
      })
      .expect(200);

    const chatId = open.body.chatId as string;

    const msgs = await e2e.agent
      .get(`/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    const first = msgs.body.messages[0];
    expect(first.text).toBe('Расскажите про это');
    expect(first.attachments).toEqual([{ kind: 'item-ref', itemId }]);
  });

  it('preview в /chats — текст сообщения когда text задан вместе с attachments', async () => {
    // Override `📌 <title>` в превью срабатывает только когда stored preview = '[media]'
    // (т.е. text пустой + есть media). Сейчас domain запрещает empty_message
    // (text+media пусты) — поэтому полноценный e2e на override требует upload медиа.
    // Здесь фиксируем базовый кейс: text непустой → preview = текст, не "📌 ...".
    const { org, client } = await setup();
    const itemId = await seedItem(org.id, 'Йога');

    await e2e.agent
      .post('/chats')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({
        organizationId: org.id,
        message: {
          text: 'Расскажите про это',
          mediaIds: [],
          attachments: [{ kind: 'item-ref', itemId }],
        },
      })
      .expect(200);

    const list = await e2e.agent
      .get('/chats')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    expect(list.body.chats[0].lastMessage.preview).toBe('Расскажите про это');
  });

  it('второе сообщение без attachments — attachments не наследуются от первого', async () => {
    const { org, client } = await setup();
    const itemId = await seedItem(org.id, 'Йога');

    const open = await e2e.agent
      .post('/chats')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({
        organizationId: org.id,
        message: {
          text: 'Первое',
          mediaIds: [],
          attachments: [{ kind: 'item-ref', itemId }],
        },
      })
      .expect(200);
    const chatId = open.body.chatId as string;

    await e2e.agent
      .post(`/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ text: 'Второе', mediaIds: [] })
      .expect(200);

    const msgs = await e2e.agent
      .get(`/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    // Сообщения возвращаются по убыванию createdAt — последнее сверху.
    const [second, first] = msgs.body.messages;
    expect(second.text).toBe('Второе');
    expect(second.attachments).toEqual([]);
    expect(first.text).toBe('Первое');
    expect(first.attachments).toEqual([{ kind: 'item-ref', itemId }]);
  });

  it('edit сообщения не меняет attachments (immutability)', async () => {
    const { org, client } = await setup();
    const itemId = await seedItem(org.id, 'Йога');

    const open = await e2e.agent
      .post('/chats')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({
        organizationId: org.id,
        message: {
          text: 'Первое',
          mediaIds: [],
          attachments: [{ kind: 'item-ref', itemId }],
        },
      })
      .expect(200);
    const chatId = open.body.chatId as string;

    const firstFetch = await e2e.agent
      .get(`/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);
    const messageId = firstFetch.body.messages[0].messageId as string;

    await e2e.agent
      .patch(`/chats/${chatId}/messages/${messageId}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ text: 'Отредактировано', mediaIds: [] })
      .expect(204);

    const after = await e2e.agent
      .get(`/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);
    const edited = after.body.messages[0];
    expect(edited.text).toBe('Отредактировано');
    expect(edited.attachments).toEqual([{ kind: 'item-ref', itemId }]);
    expect(edited.editedAt).not.toBeNull();
  });

  it('два сообщения с разными item-ref в одном чате — каждое держит свой attachment', async () => {
    const { org, client } = await setup();
    const itemA = await seedItem(org.id, 'Товар A');
    const itemB = await seedItem(org.id, 'Товар B');

    const open = await e2e.agent
      .post('/chats')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({
        organizationId: org.id,
        message: {
          text: 'про A',
          mediaIds: [],
          attachments: [{ kind: 'item-ref', itemId: itemA }],
        },
      })
      .expect(200);
    const chatId = open.body.chatId as string;

    await e2e.agent
      .post(`/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({
        text: 'про B',
        mediaIds: [],
        attachments: [{ kind: 'item-ref', itemId: itemB }],
      })
      .expect(200);

    const msgs = await e2e.agent
      .get(`/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    const [secondMsg, firstMsg] = msgs.body.messages;
    expect(firstMsg.attachments).toEqual([{ kind: 'item-ref', itemId: itemA }]);
    expect(secondMsg.attachments).toEqual([{ kind: 'item-ref', itemId: itemB }]);
  });
});
