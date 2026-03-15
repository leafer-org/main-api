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
    requests: { fileId: FileId; options: GetDownloadUrlOptions }[],
  ): Promise<(string | null)[]>;

  public abstract getPreviewDownloadUrl(fileId: FileId): Promise<string | null>;

  public abstract useFiles(tx: Transaction, fileIds: FileId[]): Promise<void>;

  public abstract freeFiles(tx: Transaction, fileIds: FileId[]): Promise<void>;

  public createDownloadUrlsLoader(options: GetDownloadUrlOptions): DownloadUrlLoader {
    return new DownloadUrlLoader(this, options);
  }
}

export class DownloadUrlLoader {
  private batch: { fileId: FileId; resolve: (url: string) => void }[] = [];
  private scheduled = false;

  public constructor(
    private readonly service: MediaService,
    private readonly options: GetDownloadUrlOptions,
  ) {}

  public get(fileId: FileId | null): Promise<string> {
    if (!fileId) return Promise.resolve('');
    return new Promise<string>((resolve) => {
      this.batch.push({ fileId, resolve });
      if (!this.scheduled) {
        this.scheduled = true;
        queueMicrotask(() => this.flush());
      }
    });
  }

  private async flush(): Promise<void> {
    const pending = this.batch;
    this.batch = [];
    this.scheduled = false;

    const urls = await this.service.getDownloadUrls(
      pending.map((p) => ({ fileId: p.fileId, options: this.options })),
    );
    for (const [i, p] of pending.entries()) {
      p.resolve(urls[i] ?? '');
    }
  }
}
