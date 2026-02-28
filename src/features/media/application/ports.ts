import type { FileState } from '../domain/aggregates/file/state.js';
import type { ImageProxyOptions, MediaVisibility } from '@/kernel/application/ports/media.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { FileId } from '@/kernel/domain/ids.js';

// --- Repository ports ---

export abstract class FileRepository {
  public abstract findById(tx: Transaction, id: FileId): Promise<FileState | null>;
  public abstract findByIds(tx: Transaction, ids: FileId[]): Promise<Map<FileId, FileState>>;
  public abstract save(tx: Transaction, state: FileState): Promise<void>;
  public abstract deleteById(tx: Transaction, id: FileId): Promise<void>;
  public abstract deleteByIds(tx: Transaction, ids: FileId[]): Promise<void>;
}

// --- Service ports ---

export abstract class FileStorageService {
  public abstract generateUploadUrl(bucket: string, key: string, mimeType: string): Promise<string>;
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

// --- ID generation ---

export abstract class FileIdGenerator {
  public abstract generateFileId(): FileId;
}

// Re-export for convenience
export type { MediaVisibility, ImageProxyOptions };
