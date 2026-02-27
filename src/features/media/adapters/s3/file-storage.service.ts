import { Injectable } from '@nestjs/common';

import type { FileStorageService } from '../../application/ports.js';
import { S3ClientService } from './s3-client.service.js';

@Injectable()
export class S3FileStorageService implements FileStorageService {
  public constructor(private readonly s3: S3ClientService) {}

  public async generateUploadUrl(bucket: string, key: string, mimeType: string): Promise<string> {
    return this.s3.getPresignedUploadUrl(bucket, key, mimeType);
  }

  public async generateDownloadUrl(bucket: string, key: string, expiresIn?: number): Promise<string> {
    return this.s3.getPresignedDownloadUrl(bucket, key, expiresIn);
  }

  public async moveToPermanent(
    tempBucket: string,
    permanentBucket: string,
    key: string,
  ): Promise<void> {
    await this.s3.copyObject(tempBucket, permanentBucket, key);
    await this.s3.deleteObject(tempBucket, key);
  }

  public async delete(bucket: string, key: string): Promise<void> {
    await this.s3.deleteObject(bucket, key);
  }
}
