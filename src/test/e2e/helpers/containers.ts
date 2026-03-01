import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

let pgContainer: StartedPostgreSqlContainer | null = null;
let minioContainer: StartedTestContainer | null = null;
let redpandaContainer: StartedTestContainer | null = null;
let zincContainer: StartedTestContainer | null = null;

export async function startContainers() {
  if (pgContainer && minioContainer && redpandaContainer && zincContainer) return;

  [pgContainer, minioContainer, redpandaContainer, zincContainer] = await Promise.all([
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
    new GenericContainer('public.ecr.aws/zinclabs/zincsearch:latest')
      .withExposedPorts(4080)
      .withEnvironment({
        ZINC_FIRST_ADMIN_USER: 'admin',
        ZINC_FIRST_ADMIN_PASSWORD: 'Complexpass#123',
        ZINC_DATA_PATH: '/data',
      })
      .withWaitStrategy(Wait.forHttp('/healthz', 4080).forStatusCode(200))
      .start(),
  ]);

  const minioHost = minioContainer.getHost();
  const minioPort = minioContainer.getMappedPort(9000);
  const kafkaPort = redpandaContainer.getMappedPort(9092);
  const zincPort = zincContainer.getMappedPort(4080);

  process.env.DB_URL = pgContainer.getConnectionUri();
  process.env.S3_ENDPOINT = `http://${minioHost}:${minioPort}`;
  process.env.S3_ACCESS_KEY = 'minioadmin';
  process.env.S3_SECRET_KEY = 'minioadmin';
  process.env.S3_REGION = 'us-east-1';
  process.env.S3_FORCE_PATH_STYLE = 'true';
  process.env.MEDIA_BUCKET_PUBLIC = 'media-public';
  process.env.KAFKA_BROKER = `localhost:${kafkaPort}`;
  process.env.KAFKA_SASL_USERNAME = 'test';
  process.env.KAFKA_SASL_PASSWORD = 'test';
  process.env.IDP_JWT_SECRET = 'e2e-test-jwt-secret-key';
  process.env.ZINC_URL = `http://${zincContainer.getHost()}:${zincPort}`;
  process.env.ZINC_USER = 'admin';
  process.env.ZINC_PASSWORD = 'Complexpass#123';
}

export async function stopContainers() {
  await Promise.all([
    pgContainer?.stop(),
    minioContainer?.stop(),
    redpandaContainer?.stop(),
    zincContainer?.stop(),
  ]);
  pgContainer = null;
  minioContainer = null;
  redpandaContainer = null;
  zincContainer = null;
}
