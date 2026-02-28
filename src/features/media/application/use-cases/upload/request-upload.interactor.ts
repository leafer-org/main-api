import { Inject, Injectable } from '@nestjs/common';

import { fileApply } from '../../../domain/aggregates/file/apply.js';
import { fileDecide } from '../../../domain/aggregates/file/decide.js';
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
import { FileIdGenerator, FileRepository, FileStorageService } from '../../ports.js';
import { type Either, isLeft, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';

@Injectable()
export class RequestUploadInteractor {
  public constructor(
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(FileRepository)
    private readonly fileRepository: FileRepository,
    @Inject(FileStorageService)
    private readonly fileStorage: FileStorageService,
    @Inject(FileIdGenerator)
    private readonly idGenerator: FileIdGenerator,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  public async execute(command: { name: string; bucket: string; mimeType: string }) {
    const parsedEither = this.parseCommand(command);
    if (isLeft(parsedEither)) return parsedEither;

    const { name, mimeType } = parsedEither.value;
    const now = this.clock.now();
    const fileId = this.idGenerator.generateFileId();
    const tempBucket = `${command.bucket}-temp`;

    return this.txHost.startTransaction(async (tx) => {
      const eventEither = fileDecide(null, {
        type: 'UploadFile',
        id: fileId,
        name: name as string,
        bucket: command.bucket,
        mimeType: mimeType as string,
        now,
      });

      if (isLeft(eventEither)) return eventEither;

      const newState = fileApply(null, eventEither.value);
      if (!newState) throw new Error('Unexpected null state after file.uploaded');

      await this.fileRepository.save(tx, newState);

      const uploadUrl = await this.fileStorage.generateUploadUrl(
        tempBucket,
        fileId,
        mimeType as string,
      );

      return Right({ fileId, uploadUrl });
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
