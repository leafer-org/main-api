import type { MediaState } from '../domain/aggregates/media/state.js';
import type { ImageProxyOptions, MediaVisibility } from '@/kernel/application/ports/media.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { MediaId } from '@/kernel/domain/ids.js';

// --- Repository ports ---

export abstract class MediaRepository {
  public abstract findById(tx: Transaction, id: MediaId): Promise<MediaState | null>;
  public abstract findByIds(tx: Transaction, ids: MediaId[]): Promise<Map<MediaId, MediaState>>;
  public abstract save(tx: Transaction, state: MediaState): Promise<void>;
  public abstract deleteById(tx: Transaction, id: MediaId): Promise<void>;
  public abstract deleteByIds(tx: Transaction, ids: MediaId[]): Promise<void>;
}

// --- Service ports ---

export type PresignedPost = {
  url: string;
  fields: Record<string, string>;
};

export abstract class FileStorageService {
  public abstract generateUploadPost(
    bucket: string,
    key: string,
    mimeType: string,
    maxFileSize: number,
  ): Promise<PresignedPost>;
  public abstract generateDownloadUrl(
    bucket: string,
    key: string,
    expiresIn?: number,
  ): Promise<string>;
  public abstract moveToPermanent(
    tempBucket: string,
    permanentBucket: string,
    key: string,
  ): Promise<void>;
  public abstract delete(bucket: string, key: string): Promise<void>;
}

export abstract class ImageProxyUrlSigner {
  public abstract sign(url: string): string;
}

// --- Config port ---

export abstract class MediaConfig {
  public abstract readonly publicBucket: string;
  public abstract readonly maxFileSize: number;
}

// --- ID generation ---

export abstract class MediaIdGenerator {
  public abstract generateMediaId(): MediaId;
}

// Re-export for convenience
export type { MediaVisibility, ImageProxyOptions };
