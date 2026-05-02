import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startContainers, stopContainers } from '../../helpers/containers.js';
import { type E2eApp } from '../../helpers/create-app.js';
import { runMigrations, truncateAll } from '../../helpers/db.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';

const FIXED_OTP = '123456';

async function seedCities(connectionUri: string) {
  const client = new pg.Client({ connectionString: connectionUri });
  await client.connect();

  await client.query(`
    INSERT INTO cms_cities (id, name, lat, lng) VALUES
      ('moscow', 'Москва', 55.7558, 37.6173),
      ('spb', 'Санкт-Петербург', 59.9343, 30.3351)
    ON CONFLICT (id) DO NOTHING;
  `);

  await client.end();
}

describe('CMS Cities', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    await startContainers();
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await runMigrations(process.env.DB_URL);

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

  describe('Чтение списка городов', () => {
    it('возвращает пустой массив когда городов нет', async () => {
      const res = await e2e.agent.get('/cities').expect(200);

      expect(res.body).toEqual([]);
    });

    it('возвращает список городов', async () => {
      await seedCities(process.env.DB_URL!);

      const res = await e2e.agent.get('/cities').expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'moscow', name: 'Москва', lat: 55.7558, lng: 37.6173 }),
          expect.objectContaining({ id: 'spb', name: 'Санкт-Петербург', lat: 59.9343, lng: 30.3351 }),
        ]),
      );
    });

    it('возвращает города отсортированные по name', async () => {
      await seedCities(process.env.DB_URL!);

      const res = await e2e.agent.get('/cities').expect(200);

      const names = res.body.map((c: { name: string }) => c.name);
      expect(names).toEqual([...names].sort());
    });

    it('доступен без авторизации', async () => {
      await e2e.agent.get('/cities').expect(200);
    });
  });
});
