import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

let pgContainer: StartedPostgreSqlContainer | null = null;
let minioContainer: StartedTestContainer | null = null;
let redpandaContainer: StartedTestContainer | null = null;
let meiliContainer: StartedTestContainer | null = null;

export async function startContainers() {
  if (pgContainer && minioContainer && redpandaContainer && meiliContainer) return;

  [pgContainer, minioContainer, redpandaContainer, meiliContainer] = await Promise.all([
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

    new GenericContainer('redpandadata/redpanda:latest')
      .withExposedPorts(9092)
      .withCommand([
        'redpanda',
        'start',
        '--smp',
        '1',
        '--memory',
        '256M',
        '--overprovisioned',
        '--kafka-addr',
        'PLAINTEXT://0.0.0.0:9092',
        '--advertise-kafka-addr',
        'PLAINTEXT://localhost:9092',
      ])
      .withWaitStrategy(Wait.forLogMessage(/Started Kafka API server/))
      .start(),

    new GenericContainer('getmeili/meilisearch:latest')
      .withExposedPorts(7700)
      .withEnvironment({
        MEILI_MASTER_KEY: 'e2e-test-master-key-1234',
        MEILI_ENV: 'development',
      })
      .withWaitStrategy(Wait.forHttp('/health', 7700).forStatusCode(200))
      .start(),
  ]);

  const minioHost = minioContainer.getHost();
  const minioPort = minioContainer.getMappedPort(9000);
  const kafkaPort = redpandaContainer.getMappedPort(9092);
  const meiliPort = meiliContainer.getMappedPort(7700);

  process.env.DB_URL = pgContainer.getConnectionUri();

  process.env.S3_ENDPOINT = `http://${minioHost}:${minioPort}`;
  process.env.S3_ACCESS_KEY = 'minioadmin';
  process.env.S3_SECRET_KEY = 'minioadmin';
  process.env.S3_REGION = 'us-east-1';
  process.env.S3_FORCE_PATH_STYLE = 'true';
  process.env.MEDIA_BUCKET_PUBLIC = 'media-public';

  process.env.KAFKA_BROKER = `localhost:${kafkaPort}`;

  process.env.IDP_JWT_SECRET = 'e2e-test-jwt-secret-key';

  process.env.MEILI_URL = `http://${meiliContainer.getHost()}:${meiliPort}`;
  process.env.MEILI_API_KEY = 'e2e-test-master-key-1234';
}

export async function stopContainers() {
  await Promise.all([
    pgContainer?.stop(),
    minioContainer?.stop(),
    redpandaContainer?.stop(),
    meiliContainer?.stop(),
  ]);
  pgContainer = null;
  minioContainer = null;
  redpandaContainer = null;
  meiliContainer = null;
}
