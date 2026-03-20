import { Inject, Injectable } from '@nestjs/common';

import { VideoDetailsRepository } from '../../application/ports.js';
import { FreeFilesInteractor } from '../../application/use-cases/free-files.interactor.js';
import { GetDownloadUrlInteractor } from '../../application/use-cases/get-download-url.interactor.js';
import { GetPreviewDownloadUrlInteractor } from '../../application/use-cases/get-preview-download-url.interactor.js';
import { UseFilesInteractor } from '../../application/use-cases/use-files.interactor.js';
import { CachedMediaUrlService } from './media-url.service.js';
import { isLeft, unwrap } from '@/infra/lib/box.js';
import { MainConfigService } from '@/infra/config/service.js';
import type { GetDownloadUrlOptions, ProcessingStatus, ResolvedMediaItem, VideoStreamInfo } from '@/kernel/application/ports/media.js';
import { MediaService } from '@/kernel/application/ports/media.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import type { MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class MediaServiceAdapter extends MediaService {
  private readonly s3PublicUrl: string | undefined;
  private readonly publicBucket: string;

  public constructor(
    private readonly downloadUrlQuery: GetDownloadUrlInteractor,
    private readonly previewUrlQuery: GetPreviewDownloadUrlInteractor,
    private readonly useFilesUseCase: UseFilesInteractor,
    private readonly freeFilesUseCase: FreeFilesInteractor,
    @Inject(VideoDetailsRepository)
    private readonly videoDetailsRepository: VideoDetailsRepository,
    private readonly mediaUrlService: CachedMediaUrlService,
    config: MainConfigService,
  ) {
    super();
    this.s3PublicUrl = config.get('S3_ENDPOINT');
    this.publicBucket = config.get('MEDIA_BUCKET_PUBLIC') ?? 'media-public';
  }

  public async getDownloadUrl(
    fileId: MediaId,
    options: GetDownloadUrlOptions,
  ): Promise<string | null> {
    const result = await this.downloadUrlQuery.execute({ fileId, options });
    return unwrap(result);
  }

  public async getDownloadUrls(
    requests: { fileId: MediaId; options: GetDownloadUrlOptions }[],
  ): Promise<(string | null)[]> {
    const result = await this.downloadUrlQuery.executeBatch({ requests });
    return unwrap(result);
  }

  public async getPreviewDownloadUrl(fileId: MediaId): Promise<string | null> {
    const result = await this.previewUrlQuery.execute({ fileId });
    return unwrap(result);
  }

  public async useFiles(tx: Transaction, fileIds: MediaId[]): Promise<void> {
    const result = await this.useFilesUseCase.execute({ tx, fileIds });
    if (isLeft(result)) throw result.error;
  }

  public async freeFiles(tx: Transaction, fileIds: MediaId[]): Promise<void> {
    const result = await this.freeFilesUseCase.execute({ tx, fileIds });
    if (isLeft(result)) throw result.error;
  }

  public async getVideoStreamInfo(mediaId: MediaId): Promise<VideoStreamInfo | null> {
    const noTx = NO_TRANSACTION as Transaction;
    const details = await this.videoDetailsRepository.findByMediaId(noTx, mediaId);
    if (!details) return null;

    const hlsUrl = this.buildHlsUrl(mediaId);
    const mp4PreviewUrl = this.buildMp4PreviewUrl(details.mp4PreviewKey);

    let thumbnailUrl: string | null = null;
    if (details.thumbnailMediaId) {
      thumbnailUrl = await this.mediaUrlService.getDownloadUrl(details.thumbnailMediaId, {
        visibility: 'PUBLIC',
      });
    }

    return {
      hlsUrl,
      mp4PreviewUrl,
      thumbnailUrl,
      status: details.processingStatus as ProcessingStatus,
      duration: details.duration,
    };
  }

  public async getVideoStatus(mediaId: MediaId): Promise<ProcessingStatus | null> {
    const noTx = NO_TRANSACTION as Transaction;
    const details = await this.videoDetailsRepository.findByMediaId(noTx, mediaId);
    if (!details) return null;
    return details.processingStatus as ProcessingStatus;
  }

  public async resolveMediaItems(items: MediaItem[]): Promise<ResolvedMediaItem[]> {
    const images = items.filter((i): i is MediaItem & { type: 'image' } => i.type === 'image');
    const videos = items.filter((i): i is MediaItem & { type: 'video' } => i.type === 'video');

    const [imageUrls, videoInfos] = await Promise.all([
      images.length > 0
        ? this.getDownloadUrls(
            images.map((i) => ({ fileId: i.mediaId, options: { visibility: 'PUBLIC' as const } })),
          )
        : Promise.resolve([]),
      Promise.all(videos.map((v) => this.getVideoStreamInfo(v.mediaId))),
    ]);

    const imageUrlMap = new Map(images.map((img, i) => [String(img.mediaId), imageUrls[i]]));
    const videoInfoMap = new Map(videos.map((vid, i) => [String(vid.mediaId), videoInfos[i]]));

    return items.map((item): ResolvedMediaItem => {
      const mediaId = String(item.mediaId);
      if (item.type === 'image') {
        const url = imageUrlMap.get(mediaId);
        return {
          type: 'image',
          mediaId,
          ...(url ? { preview: { url } } : {}),
        };
      }
      const info = videoInfoMap.get(mediaId);
      return {
        type: 'video',
        mediaId,
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
    });
  }

  private buildHlsUrl(mediaId: MediaId): string | null {
    if (!this.s3PublicUrl) return null;
    return `${this.s3PublicUrl}/${this.publicBucket}/video/${String(mediaId)}/master.m3u8`;
  }

  private buildMp4PreviewUrl(mp4PreviewKey: string | null): string | null {
    if (!this.s3PublicUrl || !mp4PreviewKey) return null;
    return `${this.s3PublicUrl}/${this.publicBucket}/${mp4PreviewKey}`;
  }
}
