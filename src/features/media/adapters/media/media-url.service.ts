import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  FileStorageService,
  type ImageProxyUrlSigner,
  MediaRepository,
} from '../../application/ports.js';
import { MimeType } from '../../domain/vo/mime-type.js';
import { MainConfigService } from '@/infra/config/service.js';
import type { GetDownloadUrlOptions, ImageProxyOptions } from '@/kernel/application/ports/media.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import type { MediaId } from '@/kernel/domain/ids.js';

const PUBLIC_CACHE_TTL_MS = 55 * 60 * 1000; // 55 minutes
const PRIVATE_CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes (presigned URL valid for 60)
const PUBLIC_PRESIGNED_TTL_SEC = 3600; // 1 hour
const PRIVATE_PRESIGNED_TTL_SEC = 3600; // 1 hour
const PREVIEW_PRESIGNED_TTL_SEC = 300; // 5 minutes
const DEFAULT_CACHE_MAX_SIZE = 2000;
const DEFAULT_TIMEOUT_MS = 5000;

export const IMAGE_PROXY_URL_SIGNER = 'IMAGE_PROXY_URL_SIGNER';

type CacheEntry = {
  url: string;
  expiresAt: number;
};

@Injectable()
export class CachedMediaUrlService {
  private readonly logger = new Logger(CachedMediaUrlService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly timeoutMs: number;
  private readonly imageProxyUrl: string | undefined;
  private readonly cdnUrl: string | undefined;

  public constructor(
    @Inject(MediaRepository)
    private readonly mediaRepository: MediaRepository,
    @Inject(FileStorageService)
    private readonly fileStorage: FileStorageService,
    @Inject(IMAGE_PROXY_URL_SIGNER)
    private readonly urlSigner: ImageProxyUrlSigner | null,
    config: MainConfigService,
  ) {
    this.maxSize = DEFAULT_CACHE_MAX_SIZE;
    this.timeoutMs = DEFAULT_TIMEOUT_MS;
    this.imageProxyUrl = config.get('MEDIA_IMAGE_PROXY_URL');
    this.cdnUrl = config.get('MEDIA_PUBLIC_CDN_URL');
  }

  public async getDownloadUrl(
    fileId: MediaId,
    options: GetDownloadUrlOptions,
  ): Promise<string | null> {
    const cacheKey = this.buildCacheKey(fileId, options);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      return await this.resolveWithTimeout(fileId, options, cacheKey);
    } catch (error) {
      this.logger.warn(`Failed to resolve download URL for ${fileId}`, error);
      return null;
    }
  }

  public async getDownloadUrls(
    requests: { fileId: MediaId; options: GetDownloadUrlOptions }[],
  ): Promise<(string | null)[]> {
    const settled = await Promise.allSettled(
      requests.map(({ fileId, options }) => this.getDownloadUrl(fileId, options)),
    );

    return settled.map((entry, i) => {
      if (entry.status === 'fulfilled') return entry.value;
      this.logger.warn(`Failed to resolve download URL for ${requests[i]?.fileId}`, entry.reason);
      return null;
    });
  }

  public async getPreviewDownloadUrl(fileId: MediaId): Promise<string | null> {
    const noTx = NO_TRANSACTION as Transaction;
    const file = await this.mediaRepository.findById(noTx, fileId);
    if (!file) return null;
    if (!file.isTemporary) return null;

    const tempBucket = `${file.bucket}-temp`;
    return this.fileStorage.generateDownloadUrl(tempBucket, file.id, PREVIEW_PRESIGNED_TTL_SEC);
  }

  private buildCacheKey(fileId: MediaId, options: GetDownloadUrlOptions): string {
    const parts: string[] = [options.visibility, fileId];

    if (options.imageProxy) {
      const p = options.imageProxy;
      if (p.width) parts.push(`w${p.width}`);
      if (p.height) parts.push(`h${p.height}`);
      if (p.quality) parts.push(`q${p.quality}`);
      if (p.format) parts.push(`f${p.format}`);
    }

    return parts.join(':');
  }

  private getFromCache(cacheKey: string): string | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.url;
  }

  private setInCache(cacheKey: string, url: string, visibility: 'PUBLIC' | 'PRIVATE'): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const ttl = visibility === 'PUBLIC' ? PUBLIC_CACHE_TTL_MS : PRIVATE_CACHE_TTL_MS;
    this.cache.set(cacheKey, {
      url,
      expiresAt: Date.now() + ttl,
    });
  }

  private async resolveWithTimeout(
    fileId: MediaId,
    options: GetDownloadUrlOptions,
    cacheKey: string,
  ): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = await this.resolveUrl(fileId, options);
      if (url) {
        this.setInCache(cacheKey, url, options.visibility);
      }
      return url;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveUrl(fileId: MediaId, options: GetDownloadUrlOptions): Promise<string | null> {
    const noTx = NO_TRANSACTION as Transaction;
    const file = await this.mediaRepository.findById(noTx, fileId);
    if (!file) return null;

    const bucket = file.isTemporary ? `${file.bucket}-temp` : file.bucket;

    if (options.visibility === 'PUBLIC' && this.cdnUrl && !file.isTemporary) {
      const baseUrl = `${this.cdnUrl}/${file.id}`;
      return this.wrapWithImageProxy(baseUrl, file.mimeType, options.imageProxy);
    }

    // When image proxy is active, use s3:// source directly
    // (imgproxy accesses S3 internally, avoiding network issues with presigned URLs)
    if (this.imageProxyUrl && options.imageProxy && MimeType.isImage(MimeType.raw(file.mimeType))) {
      return this.wrapWithImageProxy(`s3://${bucket}/${file.id}`, file.mimeType, options.imageProxy);
    }

    const ttlSec =
      options.visibility === 'PUBLIC' ? PUBLIC_PRESIGNED_TTL_SEC : PRIVATE_PRESIGNED_TTL_SEC;
    return this.fileStorage.generateDownloadUrl(bucket, file.id, ttlSec);
  }

  private wrapWithImageProxy(
    sourceUrl: string,
    mimeType: string,
    proxyOptions?: ImageProxyOptions,
  ): string {
    if (!this.imageProxyUrl || !proxyOptions) return sourceUrl;
    if (!MimeType.isImage(MimeType.raw(mimeType))) return sourceUrl;
    if (mimeType === 'image/svg+xml') return sourceUrl;

    const parts: string[] = [];
    if (proxyOptions.width || proxyOptions.height) {
      parts.push(`rs:fit:${proxyOptions.width ?? 0}:${proxyOptions.height ?? 0}`);
    }
    if (proxyOptions.quality) parts.push(`q:${proxyOptions.quality}`);

    const formatSuffix = proxyOptions.format ? `@${proxyOptions.format}` : '';
    const processing = parts.length > 0 ? `${parts.join('/')}/` : '';
    const path = `/${processing}plain/${sourceUrl}${formatSuffix}`;

    if (this.urlSigner) {
      return `${this.imageProxyUrl}${this.urlSigner.sign(path)}`;
    }

    return `${this.imageProxyUrl}/insecure${path}`;
  }
}
