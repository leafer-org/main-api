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

type CentrifugoPublication = { data: { type: string; payload: Record<string, unknown> } };
type CentrifugoHistoryResponse = {
  result?: { publications?: CentrifugoPublication[] };
  error?: { code: number; message: string };
};

async function fetchCentrifugoHistory(channel: string): Promise<CentrifugoPublication[]> {
  const url = process.env.CENTRIFUGO_API_URL;
  const apiKey = process.env.CENTRIFUGO_API_KEY;
  if (!url || !apiKey) throw new Error('CENTRIFUGO env not set');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ method: 'history', params: { channel, limit: 100 } }),
  });
  const body = (await res.json()) as CentrifugoHistoryResponse;
  if (body.error) throw new Error(`centrifugo history error: ${body.error.message}`);
  return body.result?.publications ?? [];
}

async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  timeoutMs = 15_000,
): Promise<T> {
  const start = Date.now();
  let last: T = await fn();
  while (!predicate(last)) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: timeout');
    }
    await new Promise((r) => setTimeout(r, 200));
    last = await fn();
  }
  return last;
}

describe('chat — realtime via Centrifugo', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    await startContainers({ centrifugo: true });
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

  it('GET /chats/centrifugo-token возвращает JWT', async () => {
    const user = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000111',
      fullName: 'Token User',
    });

    const res = await e2e.agent
      .get('/chats/centrifugo-token')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const parts = (res.body.token as string).split('.');
    const payloadB64 = parts[1] ?? '';
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      sub: string;
      info?: { role: string };
    };
    expect(decoded.sub).toBe(user.userId);
    expect(decoded.info?.role).toBe('user');
  });

  it('subscribe-proxy: участник чата allowed, посторонний denied', async () => {
    const owner = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000201',
      fullName: 'Org Owner',
    });
    const org = await createOrganization(e2e.agent, owner.accessToken, { name: 'RT Org' });
    const client = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000202',
      fullName: 'Client',
    });
    const stranger = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000203',
      fullName: 'Stranger',
    });

    const open = await e2e.agent
      .post('/chats')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ organizationId: org.id, message: { text: 'hi', mediaIds: [] } })
      .expect(200);
    const chatId = open.body.chatId as string;

    // client (user-side) — allow
    const ok = await e2e.agent
      .post('/internal/centrifugo/subscribe')
      .set('x-internal-secret', 'e2e-test-centrifugo-proxy-secret')
      .send({ client: 'c1', user: client.userId, channel: `chat:${chatId}` })
      .expect(200);
    expect(ok.body.result).toBeDefined();

    // owner (org slot pool) — allow
    const ownerOk = await e2e.agent
      .post('/internal/centrifugo/subscribe')
      .set('x-internal-secret', 'e2e-test-centrifugo-proxy-secret')
      .send({ client: 'c2', user: owner.userId, channel: `chat:${chatId}` })
      .expect(200);
    expect(ownerOk.body.result).toBeDefined();

    // stranger — deny
    const denied = await e2e.agent
      .post('/internal/centrifugo/subscribe')
      .set('x-internal-secret', 'e2e-test-centrifugo-proxy-secret')
      .send({ client: 'c3', user: stranger.userId, channel: `chat:${chatId}` })
      .expect(200);
    expect(denied.body.error).toEqual({ code: 403, message: 'forbidden' });

    // wrong secret — 401
    await e2e.agent
      .post('/internal/centrifugo/subscribe')
      .set('x-internal-secret', 'wrong')
      .send({ client: 'c4', user: client.userId, channel: `chat:${chatId}` })
      .expect(401);
  });

  it('bridge публикует chat.opened и chat.message.sent в chat:{id} и inbox-каналы', async () => {
    const owner = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000301',
      fullName: 'Org Owner',
    });
    const org = await createOrganization(e2e.agent, owner.accessToken, { name: 'Bridge Org' });
    const client = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000302',
      fullName: 'Client',
    });

    const open = await e2e.agent
      .post('/chats')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ organizationId: org.id, message: { text: 'Привет', mediaIds: [] } })
      .expect(200);
    const chatId = open.body.chatId as string;

    // Ждём пока бридж опубликует events в Centrifugo (outbox+kafka have lag)
    const events = await waitFor(
      () => fetchCentrifugoHistory(`chat:${chatId}`),
      (pubs) =>
        pubs.length >= 2 &&
        pubs.some((p) => p.data.type === 'chat.opened') &&
        pubs.some((p) => p.data.type === 'chat.message.sent'),
      20_000,
    );

    const types = events.map((e) => e.data.type);
    expect(types).toContain('chat.opened');
    expect(types).toContain('chat.message.sent');

    // inbox:user:{client.id} тоже должен получить копии
    const inboxClient = await fetchCentrifugoHistory(`inbox:user:${client.userId}`);
    expect(inboxClient.map((e) => e.data.type)).toContain('chat.opened');

    // inbox:org:{org.id} тоже
    const inboxOrg = await fetchCentrifugoHistory(`inbox:org:${org.id}`);
    expect(inboxOrg.map((e) => e.data.type)).toContain('chat.opened');
  });
});
