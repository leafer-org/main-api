import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';

import { MainConfigService } from '@/infra/config/service.js';

const DEFAULT_UPLOAD_EXPIRES_IN = 3600;
const DEFAULT_DOWNLOAD_EXPIRES_IN = 3600;

@Injectable()
export class S3ClientService {
  private readonly client: S3Client;

  public constructor(private readonly config: MainConfigService) {
    this.client = new S3Client({
      endpoint: this.config.get('S3_ENDPOINT'),
      region: this.config.get('S3_REGION'),
      credentials: {
        accessKeyId: this.config.get('S3_ACCESS_KEY') ?? '',
        secretAccessKey: this.config.get('S3_SECRET_KEY') ?? '',
      },
      forcePathStyle: Boolean(this.config.get('S3_FORCE_PATH_STYLE')),
    });
  }

  public async getPresignedUploadPost(
    bucket: string,
    key: string,
    mimeType: string,
    maxFileSize: number,
    expiresIn = DEFAULT_UPLOAD_EXPIRES_IN,
  ): Promise<{ url: string; fields: Record<string, string> }> {
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: bucket,
      Key: key,
      Expires: expiresIn,
      Conditions: [
        ['content-length-range', 1, maxFileSize],
        ['eq', '$Content-Type', mimeType],
      ],
      Fields: {
        'Content-Type': mimeType,
      },
    });
    return { url, fields };
  }

  public async getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expiresIn = DEFAULT_DOWNLOAD_EXPIRES_IN,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  public async copyObject(sourceBucket: string, destBucket: string, key: string): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: destBucket,
      Key: key,
      CopySource: `${sourceBucket}/${key}`,
    });
    await this.client.send(command);
  }

  public async deleteObject(bucket: string, key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    await this.client.send(command);
  }

  public async createMultipartUpload(
    bucket: string,
    key: string,
    mimeType: string,
  ): Promise<{ uploadId: string }> {
    const command = new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: mimeType,
    });
    const result = await this.client.send(command);
    if (!result.UploadId) throw new Error('Failed to create multipart upload');
    return { uploadId: result.UploadId };
  }

  public async getPresignedPartUrls(
    bucket: string,
    key: string,
    uploadId: string,
    partCount: number,
    expiresIn = DEFAULT_UPLOAD_EXPIRES_IN,
  ): Promise<string[]> {
    const urls: string[] = [];
    for (let i = 1; i <= partCount; i++) {
      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: i,
      });
      // biome-ignore lint/performance/noAwaitInLoops: sequential presigned URL generation
      const url = await getSignedUrl(this.client, command, { expiresIn });
      urls.push(url);
    }
    return urls;
  }

  public async completeMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void> {
    const command = new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    });
    await this.client.send(command);
  }

  public async downloadToFile(bucket: string, key: string, localPath: string): Promise<void> {
    await mkdir(dirname(localPath), { recursive: true });
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await this.client.send(command);
    if (!response.Body) throw new Error(`Empty body for s3://${bucket}/${key}`);
    const writable = createWriteStream(localPath);
    await pipeline(response.Body as Readable, writable);
  }

  public async putObject(
    bucket: string,
    key: string,
    localPath: string,
    contentType?: string,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(localPath),
      ContentType: contentType,
    });
    await this.client.send(command);
  }
}
