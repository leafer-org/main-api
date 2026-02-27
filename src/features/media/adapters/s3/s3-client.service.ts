import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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

  public async getPresignedUploadUrl(
    bucket: string,
    key: string,
    mimeType: string,
    expiresIn = DEFAULT_UPLOAD_EXPIRES_IN,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: mimeType,
    });
    return getSignedUrl(this.client, command, { expiresIn });
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
}
