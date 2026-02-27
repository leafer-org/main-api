import type { Transaction } from './tx-host.js';
import type { FileId } from '@/kernel/domain/ids.js';

export type MediaVisibility = 'PUBLIC' | 'PRIVATE';

export type ImageProxyOptions = {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'jpeg' | 'png';
};

export type GetDownloadUrlOptions = {
  visibility: MediaVisibility;
  imageProxy?: ImageProxyOptions;
};

export abstract class MediaService {
  public abstract getDownloadUrl(
    fileId: FileId,
    options: GetDownloadUrlOptions,
  ): Promise<string | null>;

  public abstract getDownloadUrls(
    fileIds: FileId[],
    options: GetDownloadUrlOptions,
  ): Promise<Map<FileId, string | null>>;

  public abstract getPreviewDownloadUrl(fileId: FileId): Promise<string | null>;

  public abstract useFiles(tx: Transaction, fileIds: FileId[]): Promise<void>;

  public abstract freeFiles(tx: Transaction, fileIds: FileId[]): Promise<void>;
}
