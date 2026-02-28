import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';

const BUCKETS = ['media-public', 'media-public-temp'];

export async function createBuckets() {
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
    },
    forcePathStyle: true,
  });

  await Promise.all(
    BUCKETS.map((bucket) =>
      client.send(new CreateBucketCommand({ Bucket: bucket })).catch((err) => {
        // Ignore if bucket already exists
        if (err.name === 'BucketAlreadyOwnedByYou' || err.name === 'BucketAlreadyExists') return;
        throw err;
      }),
    ),
  );
}
