import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedpandaContainer, type StartedRedpandaContainer } from '@testcontainers/redpanda';
import { GenericContainer, Network, type StartedNetwork, type StartedTestContainer, Wait } from 'testcontainers';

import { applyTopics } from './kafka.js';

const GORSE_CONFIG_PATH = resolve(import.meta.dirname, 'gorse-config.toml');

const IMGPROXY_KEY = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';
const IMGPROXY_SALT = '11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd';

export type ContainerOptions = {
  gorse?: boolean;
  imgproxy?: boolean;
  centrifugo?: boolean;
};

let network: StartedNetwork | null = null;
let pgContainer: StartedPostgreSqlContainer | null = null;
let minioContainer: StartedTestContainer | null = null;
let redpandaContainer: StartedRedpandaContainer | null = null;
let meiliContainer: StartedTestContainer | null = null;
let redisContainer: StartedTestContainer | null = null;
let gorseContainer: StartedTestContainer | null = null;
let imgproxyContainer: StartedTestContainer | null = null;
let centrifugoContainer: StartedTestContainer | null = null;

export async function startContainers(options?: ContainerOptions) {
  if (pgContainer && minioContainer && redpandaContainer && meiliContainer && redisContainer)
    return;

  network = await new Network().start();

  [pgContainer, minioContainer, redpandaContainer, meiliContainer, redisContainer] =
    await Promise.all([
      new PostgreSqlContainer('postgres:18-alpine').start(),

      new GenericContainer('minio/minio:latest')
        .withNetwork(network)
        .withNetworkAliases('minio')
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

  if (options?.gorse && !gorseContainer) {
    gorseContainer = await new GenericContainer('zhenghaoz/gorse-in-one:0.5.5')
      .withExposedPorts(8088)
      .withCopyFilesToContainer([{ source: GORSE_CONFIG_PATH, target: '/etc/gorse/config.toml' }])
      .withEnvironment({
        GORSE_CACHE_STORE: 'sqlite:///tmp/gorse-cache.db',
        GORSE_DATA_STORE: 'sqlite:///tmp/gorse-data.db',
        GORSE_SERVER_API_KEY: 'e2e-test-gorse-key',
      })
      .withCommand(['--config', '/etc/gorse/config.toml'])
      .withWaitStrategy(Wait.forHttp('/api/health/live', 8088).forStatusCode(200))
      .withStartupTimeout(120_000)
      .start();

    const gorseHost = gorseContainer.getHost();
    const gorsePort = gorseContainer.getMappedPort(8088);
    process.env.GORSE_URL = `http://${gorseHost}:${gorsePort}`;
    process.env.GORSE_API_KEY = 'e2e-test-gorse-key';
  }

  if (options?.centrifugo && !centrifugoContainer) {
    // Configure via env vars (CENTRIFUGO_* convention).
    // Namespaces передаются как JSON-строка — Centrifugo парсит JSON-значения env vars.
    const namespaces = JSON.stringify([
      { name: 'chat', history_size: 100, history_ttl: '5m', presence: true, publish: true },
      { name: 'inbox', history_size: 100, history_ttl: '5m', publish: true },
    ]);
    centrifugoContainer = await new GenericContainer('centrifugo/centrifugo:v5')
      .withExposedPorts(8000)
      .withEnvironment({
        CENTRIFUGO_TOKEN_HMAC_SECRET_KEY: 'e2e-test-centrifugo-token-secret',
        CENTRIFUGO_API_KEY: 'e2e-test-centrifugo-api-key',
        CENTRIFUGO_HEALTH: 'true',
        CENTRIFUGO_ALLOWED_ORIGINS: '*',
        CENTRIFUGO_LOG_LEVEL: 'info',
        CENTRIFUGO_NAMESPACES: namespaces,
      })
      .withWaitStrategy(Wait.forHttp('/health', 8000).forStatusCode(200))
      .withStartupTimeout(60_000)
      .start();

    const cHost = centrifugoContainer.getHost();
    const cPort = centrifugoContainer.getMappedPort(8000);
    process.env.CENTRIFUGO_API_URL = `http://${cHost}:${cPort}/api`;
    process.env.CENTRIFUGO_API_KEY = 'e2e-test-centrifugo-api-key';
    process.env.CENTRIFUGO_TOKEN_HMAC_SECRET = 'e2e-test-centrifugo-token-secret';
    process.env.CENTRIFUGO_PROXY_SECRET = 'e2e-test-centrifugo-proxy-secret';
  }

  if (options?.imgproxy && !imgproxyContainer) {
    imgproxyContainer = await new GenericContainer('darthsim/imgproxy:latest')
      .withNetwork(network)
      .withExposedPorts(8080)
      .withEnvironment({
        IMGPROXY_USE_S3: 'true',
        IMGPROXY_S3_ENDPOINT: 'http://minio:9000',
        AWS_ACCESS_KEY_ID: 'minioadmin',
        AWS_SECRET_ACCESS_KEY: 'minioadmin',
        AWS_REGION: 'us-east-1',
        IMGPROXY_KEY,
        IMGPROXY_SALT,
        IMGPROXY_MAX_SRC_FILE_SIZE: '20971520',
      })
      .withWaitStrategy(Wait.forHttp('/health', 8080).forStatusCode(200))
      .start();

    const proxyHost = imgproxyContainer.getHost();
    const proxyPort = imgproxyContainer.getMappedPort(8080);
    process.env.MEDIA_IMAGE_PROXY_URL = `http://${proxyHost}:${proxyPort}`;
    process.env.MEDIA_IMAGE_PROXY_KEY = IMGPROXY_KEY;
    process.env.MEDIA_IMAGE_PROXY_SALT = IMGPROXY_SALT;
  }
}

export async function stopContainers() {
  await Promise.all([
    pgContainer?.stop(),
    minioContainer?.stop(),
    redpandaContainer?.stop(),
    meiliContainer?.stop(),
    redisContainer?.stop(),
    gorseContainer?.stop(),
    imgproxyContainer?.stop(),
    centrifugoContainer?.stop(),
  ]);
  pgContainer = null;
  minioContainer = null;
  redpandaContainer = null;
  meiliContainer = null;
  redisContainer = null;
  gorseContainer = null;
  imgproxyContainer = null;
  centrifugoContainer = null;
  await network?.stop();
  network = null;
}
