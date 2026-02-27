import { Injectable, Logger } from '@nestjs/common';

import type {
  FileRepository,
  FileStorageService,
  MediaUrlService,
} from '../../application/ports.js';
import { MimeType } from '../../domain/vo/mime-type.js';
import { MainConfigService } from '@/infra/config/service.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { FileId } from '@/kernel/domain/ids.js';

const DEFAULT_CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes (presigned URL valid for 60)
const DEFAULT_CACHE_MAX_SIZE = 1000;
const DEFAULT_TIMEOUT_MS = 5000;

type CacheEntry = {
  url: string;
  expiresAt: number;
};

@Injectable()
export class CachedMediaUrlService implements MediaUrlService {
  private readonly logger = new Logger(CachedMediaUrlService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly cacheTtlMs: number;
  private readonly timeoutMs: number;
  private readonly imageProxyUrl: string | undefined;

  public constructor(
    private readonly fileRepository: FileRepository,
    private readonly fileStorage: FileStorageService,
    config: MainConfigService,
  ) {
    this.maxSize = DEFAULT_CACHE_MAX_SIZE;
    this.cacheTtlMs = DEFAULT_CACHE_TTL_MS;
    this.timeoutMs = DEFAULT_TIMEOUT_MS;
    this.imageProxyUrl = config.get('MEDIA_IMAGE_PROXY_URL');
  }

  public async getDownloadUrl(fileId: FileId): Promise<string | null> {
    const cached = this.getFromCache(fileId);
    if (cached) return cached;

    try {
      return await this.resolveWithTimeout(fileId);
    } catch (error) {
      this.logger.warn(`Failed to resolve download URL for ${fileId}`, error);
      return null;
    }
  }

  public async getDownloadUrls(fileIds: FileId[]): Promise<Map<FileId, string | null>> {
    const result = new Map<FileId, string | null>();
    const uncached: FileId[] = [];

    for (const fileId of fileIds) {
      const cached = this.getFromCache(fileId);
      if (cached) {
        result.set(fileId, cached);
      } else {
        uncached.push(fileId);
      }
    }

    if (uncached.length > 0) {
      const settled = await Promise.allSettled(
        uncached.map(async (fileId) => {
          const url = await this.resolveWithTimeout(fileId);
          return { fileId, url };
        }),
      );

      for (const [i, entry] of settled.entries()) {
        if (entry.status === 'fulfilled') {
          result.set(entry.value.fileId, entry.value.url);
        } else {
          const id = uncached[i] as FileId;
          this.logger.warn(`Failed to resolve download URL for ${id}`, entry.reason);
          result.set(id, null);
        }
      }
    }

    return result;
  }

  private getFromCache(fileId: FileId): string | null {
    const entry = this.cache.get(fileId);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(fileId);
      return null;
    }

    return entry.url;
  }

  private setInCache(fileId: FileId, url: string): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(fileId, {
      url,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  private async resolveWithTimeout(fileId: FileId): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = await this.resolveUrl(fileId);
      if (url) {
        this.setInCache(fileId, url);
      }
      return url;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveUrl(fileId: FileId): Promise<string | null> {
    // Use a no-op transaction for read-only queries
    const noTx = { type: 'no-transaction' } as Transaction;
    const file = await this.fileRepository.findById(noTx, fileId);
    if (!file) return null;

    const bucket = file.isTemporary ? `${file.bucket}-temp` : file.bucket;
    const presignedUrl = await this.fileStorage.generateDownloadUrl(bucket, file.id);

    if (this.imageProxyUrl && MimeType.isImage(file.mimeType as ReturnType<typeof MimeType.raw>)) {
      return `${this.imageProxyUrl}/${encodeURIComponent(presignedUrl)}`;
    }

    return presignedUrl;
  }
}
