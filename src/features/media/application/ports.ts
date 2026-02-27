import type { FileState } from '../domain/aggregates/file/state.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { FileId } from '@/kernel/domain/ids.js';

// --- Repository ports ---

export interface FileRepository {
  findById(tx: Transaction, id: FileId): Promise<FileState | null>;
  save(tx: Transaction, state: FileState): Promise<void>;
  deleteById(tx: Transaction, id: FileId): Promise<void>;
}

// --- Service ports ---

export interface FileStorageService {
  generateUploadUrl(bucket: string, key: string, mimeType: string): Promise<string>;
  generateDownloadUrl(bucket: string, key: string): Promise<string>;
  moveToPermanent(tempBucket: string, permanentBucket: string, key: string): Promise<void>;
  delete(bucket: string, key: string): Promise<void>;
}

export interface MediaUrlService {
  getDownloadUrl(fileId: FileId): Promise<string | null>;
  getDownloadUrls(fileIds: FileId[]): Promise<Map<FileId, string | null>>;
}

// --- ID generation ---

export interface FileIdGenerator {
  generateFileId(): FileId;
}
