import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

let pgContainer: StartedPostgreSqlContainer | null = null;
let minioContainer: StartedTestContainer | null = null;

export async function startContainers() {
  if (pgContainer && minioContainer) return;

  [pgContainer, minioContainer] = await Promise.all([
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
  ]);

  const minioHost = minioContainer.getHost();
  const minioPort = minioContainer.getMappedPort(9000);

  process.env.DB_URL = pgContainer.getConnectionUri();
  process.env.S3_ENDPOINT = `http://${minioHost}:${minioPort}`;
  process.env.S3_ACCESS_KEY = 'minioadmin';
  process.env.S3_SECRET_KEY = 'minioadmin';
  process.env.S3_REGION = 'us-east-1';
  process.env.S3_FORCE_PATH_STYLE = 'true';
  process.env.MEDIA_BUCKET_PUBLIC = 'media-public';

  // Dummy values for required config fields not used in media tests
  process.env.KAFKA_BROKER = 'localhost:9092';
  process.env.KAFKA_SASL_USERNAME = 'test';
  process.env.KAFKA_SASL_PASSWORD = 'test';
  process.env.IDP_JWT_SECRET = 'e2e-test-jwt-secret-key';
}

export async function stopContainers() {
  await Promise.all([pgContainer?.stop(), minioContainer?.stop()]);
  pgContainer = null;
  minioContainer = null;
}
