import type { FileState } from '../domain/aggregates/file/state.js';
import type {
  GetDownloadUrlOptions,
  ImageProxyOptions,
  MediaVisibility,
} from '@/kernel/application/ports/media.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { FileId } from '@/kernel/domain/ids.js';

// --- Repository ports ---

export interface FileRepository {
  findById(tx: Transaction, id: FileId): Promise<FileState | null>;
  findByIds(tx: Transaction, ids: FileId[]): Promise<Map<FileId, FileState>>;
  save(tx: Transaction, state: FileState): Promise<void>;
  deleteById(tx: Transaction, id: FileId): Promise<void>;
  deleteByIds(tx: Transaction, ids: FileId[]): Promise<void>;
}

// --- Service ports ---

export interface FileStorageService {
  generateUploadUrl(bucket: string, key: string, mimeType: string): Promise<string>;
  generateDownloadUrl(bucket: string, key: string, expiresIn?: number): Promise<string>;
  moveToPermanent(tempBucket: string, permanentBucket: string, key: string): Promise<void>;
  delete(bucket: string, key: string): Promise<void>;
}

export type DownloadUrlOptions = GetDownloadUrlOptions;

export interface MediaUrlService {
  getDownloadUrl(fileId: FileId, options: DownloadUrlOptions): Promise<string | null>;
  getDownloadUrls(
    fileIds: FileId[],
    options: DownloadUrlOptions,
  ): Promise<Map<FileId, string | null>>;
  getPreviewDownloadUrl(fileId: FileId): Promise<string | null>;
}

export interface ImageProxyUrlSigner {
  sign(url: string): string;
}

// --- ID generation ---

export interface FileIdGenerator {
  generateFileId(): FileId;
}

// Re-export for convenience
export type { MediaVisibility, ImageProxyOptions };
