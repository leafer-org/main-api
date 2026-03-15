import { Inject, Injectable } from '@nestjs/common';

import { mediaApply } from '../../domain/aggregates/media/apply.js';
import { mediaDecide } from '../../domain/aggregates/media/decide.js';
import { MediaNotFoundError } from '../../domain/aggregates/media/errors.js';
import { FileStorageService, MediaRepository } from '../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class FreeFileInteractor {
  public constructor(
    @Inject(MediaRepository)
    private readonly mediaRepository: MediaRepository,
    @Inject(FileStorageService)
    private readonly fileStorage: FileStorageService,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  public async execute(command: { fileId: MediaId }) {
    return this.txHost.startTransaction(async (tx) => {
      const state = await this.mediaRepository.findById(tx, command.fileId);
      if (!state) return Left(new MediaNotFoundError());

      const eventEither = mediaDecide(state, { type: 'FreeMedia' });

      if (isLeft(eventEither)) return eventEither;

      // apply returns null for media.freed — aggregate is deleted
      mediaApply(state, eventEither.value);

      await this.mediaRepository.deleteById(tx, state.id);

      const bucket = state.isTemporary ? `${state.bucket}-temp` : state.bucket;
      await this.fileStorage.delete(bucket, state.id);

      return Right(undefined);
    });
  }
}
