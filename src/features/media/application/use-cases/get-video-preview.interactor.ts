import { Inject, Injectable } from '@nestjs/common';

import { MediaNotFoundError, MediaPreviewForbiddenError } from '../../domain/aggregates/media/errors.js';
import { MediaRepository, VideoProcessingProgress } from '../ports.js';
import { Left, Right } from '@/infra/lib/box.js';
import { MediaService } from '@/kernel/application/ports/media.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetVideoPreviewInteractor {
  public constructor(
    @Inject(MediaRepository)
    private readonly mediaRepository: MediaRepository,
    @Inject(MediaService)
    private readonly mediaService: MediaService,
    @Inject(VideoProcessingProgress)
    private readonly processingProgress: VideoProcessingProgress,
  ) {}

  public async execute(command: { mediaId: MediaId }) {
    const noTx = NO_TRANSACTION as Transaction;

    const media = await this.mediaRepository.findById(noTx, command.mediaId);
    if (!media) return Left(new MediaNotFoundError());
    if (!media.isTemporary) return Left(new MediaPreviewForbiddenError());

    const info = await this.mediaService.getVideoStreamInfo(command.mediaId);
    if (!info) return Right(null);

    const progress =
      info.status === 'processing'
        ? await this.processingProgress.get(command.mediaId)
        : null;

    return Right({
      mediaId: String(command.mediaId),
      processingStatus: info.status,
      progress: progress ?? null,
      hlsUrl: info.status === 'ready' ? info.hlsUrl : null,
      mp4PreviewUrl: info.status === 'ready' ? info.mp4PreviewUrl : null,
      thumbnailUrl: info.thumbnailUrl,
      duration: info.duration,
    });
  }
}
