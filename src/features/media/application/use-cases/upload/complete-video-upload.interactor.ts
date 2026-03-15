import { Inject, Injectable } from '@nestjs/common';

import { MediaNotFoundError, MediaNotVideoError } from '../../../domain/aggregates/media/errors.js';
import { FileStorageService, MediaRepository, VideoDetailsRepository, VideoProcessingQueue } from '../../ports.js';
import { Left, Right } from '@/infra/lib/box.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class CompleteVideoUploadInteractor {
  public constructor(
    @Inject(MediaRepository)
    private readonly mediaRepository: MediaRepository,
    @Inject(VideoDetailsRepository)
    private readonly videoDetailsRepository: VideoDetailsRepository,
    @Inject(FileStorageService)
    private readonly fileStorage: FileStorageService,
    @Inject(VideoProcessingQueue)
    private readonly processingQueue: VideoProcessingQueue,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  public async execute(command: {
    mediaId: MediaId;
    uploadId: string;
    parts: { partNumber: number; etag: string }[];
  }) {
    return this.txHost.startTransaction(async (tx) => {
      const state = await this.mediaRepository.findById(tx, command.mediaId);
      if (!state) return Left(new MediaNotFoundError());
      if (state.type !== 'video') return Left(new MediaNotVideoError());

      const tempBucket = `${state.bucket}-temp`;

      await this.fileStorage.completeMultipartUpload(
        tempBucket,
        command.mediaId,
        command.uploadId,
        command.parts,
      );

      await this.processingQueue.enqueue(command.mediaId, state.bucket);

      return Right({ mediaId: command.mediaId });
    });
  }
}
