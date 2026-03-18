import { Inject, Injectable } from '@nestjs/common';

import { MediaEntity } from '../../../domain/aggregates/media/entity.js';
import { VideoDetailsEntity } from '../../../domain/aggregates/media/entities/video-details.entity.js';
import {
  type FileName,
  FileName as FileNameVO,
  InvalidFileNameError,
} from '../../../domain/vo/file-name.js';
import {
  InvalidMimeTypeError,
  type MimeType,
  MimeType as MimeTypeVO,
} from '../../../domain/vo/mime-type.js';
import {
  FileStorageService,
  MediaConfig,
  MediaIdGenerator,
  MediaRepository,
  VideoDetailsRepository,
} from '../../ports.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { CreateDomainError } from '@/infra/ddd/error.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';

const PART_SIZE = 10 * 1024 * 1024; // 10MB

export class NotVideoMimeTypeError extends CreateDomainError('not_video_mime_type', 400) {}
export class VideoTooLargeError extends CreateDomainError('video_too_large', 400) {}

@Injectable()
export class InitVideoUploadInteractor {
  private readonly bucket: string;

  public constructor(
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(MediaRepository)
    private readonly mediaRepository: MediaRepository,
    @Inject(VideoDetailsRepository)
    private readonly videoDetailsRepository: VideoDetailsRepository,
    @Inject(FileStorageService)
    private readonly fileStorage: FileStorageService,
    @Inject(MediaIdGenerator)
    private readonly idGenerator: MediaIdGenerator,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
    @Inject(MediaConfig)
    private readonly mediaConfig: MediaConfig,
  ) {
    this.bucket = this.mediaConfig.publicBucket;
  }

  public async execute(command: { name: string; mimeType: string; fileSize: number }) {
    const parsedEither = this.parseCommand(command);
    if (isLeft(parsedEither)) return parsedEither;

    const { name, mimeType } = parsedEither.value;

    if (!MimeTypeVO.isVideo(mimeType)) {
      return Left(new NotVideoMimeTypeError());
    }

    if (command.fileSize > this.mediaConfig.maxVideoFileSize) {
      return Left(new VideoTooLargeError());
    }

    const now = this.clock.now();
    const mediaId = this.idGenerator.generateMediaId();
    const tempBucket = `${this.bucket}-temp`;
    const partCount = Math.ceil(command.fileSize / PART_SIZE);

    return this.txHost.startTransaction(async (tx) => {
      const result = MediaEntity.upload({
        id: mediaId,
        mediaType: 'video',
        name: name as string,
        bucket: this.bucket,
        mimeType: mimeType as string,
        now,
      });

      if (isLeft(result)) return result;

      await this.mediaRepository.save(tx, result.value.state);
      await this.videoDetailsRepository.save(tx, VideoDetailsEntity.create(mediaId));

      const { uploadId } = await this.fileStorage.createMultipartUpload(
        tempBucket,
        mediaId,
        mimeType as string,
      );

      const partUrls = await this.fileStorage.getPresignedPartUrls(
        tempBucket,
        mediaId,
        uploadId,
        partCount,
      );

      return Right({ mediaId, uploadId, partUrls });
    });
  }

  private parseCommand(command: {
    name: string;
    mimeType: string;
  }): Either<InvalidFileNameError | InvalidMimeTypeError, { name: FileName; mimeType: MimeType }> {
    const nameEither = FileNameVO.create(command.name);
    if (isLeft(nameEither)) return nameEither;

    const mimeTypeEither = MimeTypeVO.create(command.mimeType);
    if (isLeft(mimeTypeEither)) return mimeTypeEither;

    return Right({ name: nameEither.value, mimeType: mimeTypeEither.value });
  }
}
