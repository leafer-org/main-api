import type { Transaction } from './tx-host.js';
import type { MediaId } from '@/kernel/domain/ids.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';

export type ImagePreview = {
  url: string;
};

export type VideoPreview = {
  thumbnailUrl: string | null;
  hlsUrl: string | null;
  mp4PreviewUrl: string | null;
  processingStatus: ProcessingStatus;
  progress: number | null;
};

export type ResolvedMediaItem = {
  type: 'image' | 'video';
  mediaId: string;
  preview?: ImagePreview | VideoPreview;
};

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

export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type VideoStreamInfo = {
  hlsUrl: string | null;
  mp4PreviewUrl: string | null;
  thumbnailUrl: string | null;
  status: ProcessingStatus;
  duration: number | null;
};

export abstract class MediaService {
  public abstract getDownloadUrl(
    fileId: MediaId,
    options: GetDownloadUrlOptions,
  ): Promise<string | null>;

  public abstract getDownloadUrls(
    requests: { fileId: MediaId; options: GetDownloadUrlOptions }[],
  ): Promise<(string | null)[]>;

  public abstract getPreviewDownloadUrl(fileId: MediaId): Promise<string | null>;

  public abstract useFiles(tx: Transaction, fileIds: MediaId[]): Promise<void>;

  public abstract freeFiles(tx: Transaction, fileIds: MediaId[]): Promise<void>;

  public abstract getVideoStreamInfo(mediaId: MediaId): Promise<VideoStreamInfo | null>;

  public abstract getVideoStatus(mediaId: MediaId): Promise<ProcessingStatus | null>;

  public abstract resolveMediaItems(items: MediaItem[]): Promise<ResolvedMediaItem[]>;

  public createDownloadUrlsLoader(options: GetDownloadUrlOptions): DownloadUrlLoader {
    return new DownloadUrlLoader(this, options);
  }
}

export class DownloadUrlLoader {
  private batch: { fileId: MediaId; resolve: (url: string) => void }[] = [];
  private scheduled = false;

  public constructor(
    private readonly service: MediaService,
    private readonly options: GetDownloadUrlOptions,
  ) {}

  public get(fileId: MediaId | null): Promise<string> {
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
