import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedpandaContainer, type StartedRedpandaContainer } from '@testcontainers/redpanda';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

import { applyTopics } from './kafka.js';

let pgContainer: StartedPostgreSqlContainer | null = null;
let minioContainer: StartedTestContainer | null = null;
let redpandaContainer: StartedRedpandaContainer | null = null;
let meiliContainer: StartedTestContainer | null = null;
let redisContainer: StartedTestContainer | null = null;

export async function startContainers() {
  if (pgContainer && minioContainer && redpandaContainer && meiliContainer && redisContainer) return;

  [pgContainer, minioContainer, redpandaContainer, meiliContainer, redisContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:18-alpine').start(),

    new GenericContainer('minio/minio:latest')
      .withExposedPorts(9000)
      .withEnvironment({
        MINIO_ROOT_USER: 'minioadmin',
        MINIO_ROOT_PASSWORD: 'minioadmin',
      })
      .withCommand(['server', '/data'])
      .withWaitStrategy(Wait.forHttp('/minio/health/ready', 9000).forStatusCode(200))
      .start(),

    new RedpandaContainer('redpandadata/redpanda:latest').start(),

    new GenericContainer('getmeili/meilisearch:latest')
      .withExposedPorts(7700)
      .withEnvironment({
        MEILI_MASTER_KEY: 'e2e-test-master-key-1234',
        MEILI_ENV: 'development',
      })
      .withWaitStrategy(Wait.forHttp('/health', 7700).forStatusCode(200))
      .start(),

    new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forListeningPorts())
      .start(),
  ]);

  await applyTopics(redpandaContainer);

  const minioHost = minioContainer.getHost();
  const minioPort = minioContainer.getMappedPort(9000);
  const meiliPort = meiliContainer.getMappedPort(7700);

  process.env.DB_URL = pgContainer.getConnectionUri();

  process.env.S3_ENDPOINT = `http://${minioHost}:${minioPort}`;
  process.env.S3_ACCESS_KEY = 'minioadmin';
  process.env.S3_SECRET_KEY = 'minioadmin';
  process.env.S3_REGION = 'us-east-1';
  process.env.S3_FORCE_PATH_STYLE = 'true';
  process.env.MEDIA_BUCKET_PUBLIC = 'media-public';

  process.env.KAFKA_BROKER = redpandaContainer.getBootstrapServers();

  process.env.IDP_JWT_SECRET = 'e2e-test-jwt-secret-key';

  process.env.MEILI_URL = `http://${meiliContainer.getHost()}:${meiliPort}`;
  process.env.MEILI_API_KEY = 'e2e-test-master-key-1234';

  const redisHost = redisContainer.getHost();
  const redisPort = redisContainer.getMappedPort(6379);
  process.env.REDIS_URL = `redis://${redisHost}:${redisPort}`;
}

export async function stopContainers() {
  await Promise.all([
    pgContainer?.stop(),
    minioContainer?.stop(),
    redpandaContainer?.stop(),
    meiliContainer?.stop(),
    redisContainer?.stop(),
  ]);
  pgContainer = null;
  minioContainer = null;
  redpandaContainer = null;
  meiliContainer = null;
  redisContainer = null;
}
