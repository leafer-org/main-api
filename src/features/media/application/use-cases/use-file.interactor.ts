import { Inject, Injectable } from '@nestjs/common';

import { MediaEntity } from '../../domain/aggregates/media/entity.js';
import { MediaNotFoundError } from '../../domain/aggregates/media/errors.js';
import { FileStorageService, MediaRepository } from '../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class UseFileInteractor {
  public constructor(
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(MediaRepository)
    private readonly mediaRepository: MediaRepository,
    @Inject(FileStorageService)
    private readonly fileStorage: FileStorageService,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  public async execute(command: { fileId: MediaId }) {
    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.mediaRepository.findById(tx, command.fileId);
      if (!state) return Left(new MediaNotFoundError());

      const result = MediaEntity.use(state, { now });
      if (isLeft(result)) return result;

      await this.mediaRepository.save(tx, result.value.state);

      const tempBucket = `${state.bucket}-temp`;
      await this.fileStorage.moveToPermanent(tempBucket, state.bucket, state.id);

      return Right(undefined);
    });
  }
}
