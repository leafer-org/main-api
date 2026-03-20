import { readdir } from 'node:fs/promises';
import { extname, join, posix } from 'node:path';
import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';

import { FileStorageService, type PresignedPost } from '../../application/ports.js';
import { S3ClientService } from './s3-client.service.js';

const MIME_BY_EXT: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

@Injectable()
export class S3FileStorageService implements FileStorageService {
  public constructor(private readonly s3: S3ClientService) {}

  public async generateUploadPost(
    bucket: string,
    key: string,
    mimeType: string,
    maxFileSize: number,
  ): Promise<PresignedPost> {
    return this.s3.getPresignedUploadPost(bucket, key, mimeType, maxFileSize);
  }

  public async generateDownloadUrl(
    bucket: string,
    key: string,
    expiresIn?: number,
  ): Promise<string> {
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

  public async createMultipartUpload(
    bucket: string,
    key: string,
    mimeType: string,
  ): Promise<{ uploadId: string }> {
    return this.s3.createMultipartUpload(bucket, key, mimeType);
  }

  public async getPresignedPartUrls(
    bucket: string,
    key: string,
    uploadId: string,
    partCount: number,
  ): Promise<string[]> {
    return this.s3.getPresignedPartUrls(bucket, key, uploadId, partCount);
  }

  public async completeMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void> {
    return this.s3.completeMultipartUpload(bucket, key, uploadId, parts);
  }

  public async getObjectStream(bucket: string, key: string): Promise<Readable> {
    return this.s3.getObjectStream(bucket, key);
  }

  public async downloadToFile(bucket: string, key: string, localPath: string): Promise<void> {
    return this.s3.downloadToFile(bucket, key, localPath);
  }

  public async uploadFile(
    bucket: string,
    key: string,
    localPath: string,
    contentType?: string,
  ): Promise<void> {
    return this.s3.putObject(bucket, key, localPath, contentType);
  }

  public async uploadDirectory(bucket: string, prefix: string, localDir: string): Promise<void> {
    const entries = await readdir(localDir, { withFileTypes: true });
    for (const entry of entries) {
      const localPath = join(localDir, entry.name);
      if (entry.isDirectory()) {
        // biome-ignore lint/performance/noAwaitInLoops: sequential directory traversal
        await this.uploadDirectory(bucket, posix.join(prefix, entry.name), localPath);
      } else if (entry.isFile()) {
        const s3Key = posix.join(prefix, entry.name);
        const ct = MIME_BY_EXT[extname(entry.name).toLowerCase()] ?? 'application/octet-stream';
        await this.s3.putObject(bucket, s3Key, localPath, ct);
      }
    }
  }
}
