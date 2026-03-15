import { Inject, Injectable } from '@nestjs/common';

import { mediaApply } from '../../../domain/aggregates/media/apply.js';
import { mediaDecide } from '../../../domain/aggregates/media/decide.js';
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
import { FileStorageService, MediaConfig, MediaIdGenerator, MediaRepository } from '../../ports.js';
import { type Either, isLeft, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';

@Injectable()
export class RequestUploadInteractor {
  private readonly bucket: string;

  public constructor(
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(MediaRepository)
    private readonly mediaRepository: MediaRepository,
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

  public async execute(command: { name: string; mimeType: string }) {
    const parsedEither = this.parseCommand(command);
    if (isLeft(parsedEither)) return parsedEither;

    const { name, mimeType } = parsedEither.value;
    const now = this.clock.now();
    const mediaId = this.idGenerator.generateMediaId();
    const tempBucket = `${this.bucket}-temp`;

    return this.txHost.startTransaction(async (tx) => {
      const eventEither = mediaDecide(null, {
        type: 'UploadMedia',
        id: mediaId,
        mediaType: 'image',
        name: name as string,
        bucket: this.bucket,
        mimeType: mimeType as string,
        now,
      });

      if (isLeft(eventEither)) return eventEither;

      const newState = mediaApply(null, eventEither.value);
      if (!newState) throw new Error('Unexpected null state after media.uploaded');

      await this.mediaRepository.save(tx, newState);

      const { url: uploadUrl, fields: uploadFields } = await this.fileStorage.generateUploadPost(
        tempBucket,
        mediaId,
        mimeType as string,
        this.mediaConfig.maxFileSize,
      );

      return Right({ fileId: mediaId, uploadUrl, uploadFields });
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

    return Right({
      name: nameEither.value,
      mimeType: mimeTypeEither.value,
    });
  }
}
