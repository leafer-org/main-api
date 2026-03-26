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

export type ResolvedImageMedia = {
  type: 'image';
  mediaId: string;
  preview?: ImagePreview;
};

export type ResolvedVideoMedia = {
  type: 'video';
  mediaId: string;
  preview?: VideoPreview;
};

export type ResolvedMediaItem = ResolvedImageMedia | ResolvedVideoMedia;

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

  public createMediaLoader(imageOptions: GetDownloadUrlOptions): MediaLoader {
    return new MediaLoader(this, imageOptions);
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

/**
 * Microtask-batched loader для изображений и видео.
 *
 * Все вызовы `getImageUrl` / `getVideoInfo` / `resolve` в рамках одного microtask
 * собираются в два batch-запроса: `getDownloadUrls` (images + avatars) и `getVideoStreamInfo` (videos).
 */
export class MediaLoader {
  private imageBatch: {
    fileId: MediaId;
    options: GetDownloadUrlOptions;
    resolve: (url: string | null) => void;
  }[] = [];
  private videoBatch: { mediaId: MediaId; resolve: (info: VideoStreamInfo | null) => void }[] = [];
  private imageScheduled = false;
  private videoScheduled = false;

  public constructor(
    private readonly service: MediaService,
    private readonly defaultImageOptions: GetDownloadUrlOptions,
  ) {}

  /** Получить URL изображения (батчится). Можно переопределить imageProxy для конкретного вызова. */
  public getImageUrl(
    fileId: MediaId | null,
    imageProxy?: ImageProxyOptions,
  ): Promise<string | null> {
    if (!fileId) return Promise.resolve(null);
    const options = imageProxy
      ? { ...this.defaultImageOptions, imageProxy }
      : this.defaultImageOptions;
    return new Promise<string | null>((resolve) => {
      this.imageBatch.push({ fileId, options, resolve });
      this.scheduleImageFlush();
    });
  }

  /** Получить VideoStreamInfo (батчится). */
  public getVideoInfo(mediaId: MediaId): Promise<VideoStreamInfo | null> {
    return new Promise<VideoStreamInfo | null>((resolve) => {
      this.videoBatch.push({ mediaId, resolve });
      this.scheduleVideoFlush();
    });
  }

  /** Резолвит MediaItem → ResolvedMediaItem. */
  public async resolve(item: MediaItem): Promise<ResolvedMediaItem> {
    const mediaId = item.mediaId;
    if (item.type === 'image') {
      const url = await this.getImageUrl(mediaId);
      return { type: 'image', mediaId: String(mediaId), ...(url ? { preview: { url } } : {}) };
    }
    const info = await this.getVideoInfo(mediaId);
    return {
      type: 'video',
      mediaId: String(mediaId),
      ...(info
        ? {
            preview: {
              thumbnailUrl: info.thumbnailUrl,
              hlsUrl: info.hlsUrl,
              mp4PreviewUrl: info.mp4PreviewUrl,
              processingStatus: info.status,
              progress: null,
            },
          }
        : {}),
    };
  }

  private scheduleImageFlush(): void {
    if (!this.imageScheduled) {
      this.imageScheduled = true;
      queueMicrotask(() => this.flushImages());
    }
  }

  private scheduleVideoFlush(): void {
    if (!this.videoScheduled) {
      this.videoScheduled = true;
      queueMicrotask(() => this.flushVideos());
    }
  }

  private async flushImages(): Promise<void> {
    const pending = this.imageBatch;
    this.imageBatch = [];
    this.imageScheduled = false;

    const urls = await this.service.getDownloadUrls(
      pending.map((p) => ({ fileId: p.fileId, options: p.options })),
    );
    for (const [i, p] of pending.entries()) {
      p.resolve(urls[i] ?? null);
    }
  }

  private async flushVideos(): Promise<void> {
    const pending = this.videoBatch;
    this.videoBatch = [];
    this.videoScheduled = false;

    const infos = await Promise.all(
      pending.map((p) => this.service.getVideoStreamInfo(p.mediaId)),
    );
    for (const [i, p] of pending.entries()) {
      p.resolve(infos[i] ?? null);
    }
  }
}
