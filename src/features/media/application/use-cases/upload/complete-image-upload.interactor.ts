import { Inject, Injectable } from '@nestjs/common';

import { MediaEntity } from '../../../domain/aggregates/media/entity.js';
import {
  MediaAlreadyInUseError,
  MediaNotFoundError,
  MediaNotImageError,
} from '../../../domain/aggregates/media/errors.js';
import {
  FileStorageService,
  ImageMetadataExtractor,
  MediaConfig,
  MediaRepository,
} from '../../ports.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import { NO_TRANSACTION, TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { MediaId } from '@/kernel/domain/ids.js';

const FORMAT_TO_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
};

@Injectable()
export class CompleteImageUploadInteractor {
  private readonly bucket: string;

  public constructor(
    @Inject(MediaRepository)
    private readonly mediaRepository: MediaRepository,
    @Inject(FileStorageService)
    private readonly fileStorage: FileStorageService,
    @Inject(ImageMetadataExtractor)
    private readonly metadataExtractor: ImageMetadataExtractor,
    @Inject(MediaConfig)
    private readonly mediaConfig: MediaConfig,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {
    this.bucket = this.mediaConfig.publicBucket;
  }

  public async execute(command: {
    mediaId: string;
  }): Promise<
    Either<
      MediaNotFoundError | MediaNotImageError | MediaAlreadyInUseError,
      { mediaId: string; width: number; height: number; mimeType: string }
    >
  > {
    const mediaId = MediaId.raw(command.mediaId);

    // 1. Validate entity exists and is an image before touching S3
    const state = await this.mediaRepository.findById(NO_TRANSACTION as Transaction, mediaId);
    if (!state) return Left(new MediaNotFoundError());
    if (state.type !== 'image') return Left(new MediaNotImageError());
    if (!state.isTemporary) return Left(new MediaAlreadyInUseError());

    // 2. Extract metadata from S3
    const tempBucket = `${this.bucket}-temp`;
    const stream = await this.fileStorage.getObjectStream(tempBucket, mediaId);
    const metadata = await this.metadataExtractor.extract(stream);

    const verifiedMimeType = FORMAT_TO_MIME[metadata.format] ?? `image/${metadata.format}`;

    // 3. Save within transaction
    return this.txHost.startTransaction(async (tx) => {
      const currentState = await this.mediaRepository.findById(tx, mediaId);
      if (!currentState) return Left(new MediaNotFoundError());

      const result = MediaEntity.completeImageUpload(currentState, {
        width: metadata.width,
        height: metadata.height,
        verifiedMimeType,
      });

      if (isLeft(result)) return result;

      await this.mediaRepository.save(tx, result.value.state);

      return Right({
        mediaId: command.mediaId,
        width: metadata.width,
        height: metadata.height,
        mimeType: verifiedMimeType,
      });
    });
  }
}
