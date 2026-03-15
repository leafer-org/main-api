import { Inject, Injectable } from '@nestjs/common';

import { mediaApply } from '../../domain/aggregates/media/apply.js';
import { mediaDecide } from '../../domain/aggregates/media/decide.js';
import { MediaNotFoundError } from '../../domain/aggregates/media/errors.js';
import { FileStorageService, MediaRepository } from '../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class UseFilesInteractor {
  public constructor(
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(MediaRepository)
    private readonly mediaRepository: MediaRepository,
    @Inject(FileStorageService)
    private readonly fileStorage: FileStorageService,
  ) {}

  public async execute(command: { tx: Transaction; fileIds: MediaId[] }) {
    const now = this.clock.now();
    const { tx, fileIds } = command;

    const states = await this.mediaRepository.findByIds(tx, fileIds);

    for (const fileId of fileIds) {
      if (!states.has(fileId)) return Left(new MediaNotFoundError());
    }

    for (const fileId of fileIds) {
      const state = states.get(fileId);
      if (!state) return Left(new MediaNotFoundError());
      const eventEither = mediaDecide(state, { type: 'UseMedia', now });
      if (isLeft(eventEither)) return eventEither;

      const newState = mediaApply(state, eventEither.value);
      if (!newState) throw new Error('Unexpected null state after media.used');

      // biome-ignore lint/performance/noAwaitInLoops: sequential execution is intentional for storage side effects
      await this.mediaRepository.save(tx, newState);

      const tempBucket = `${state.bucket}-temp`;
      await this.fileStorage.moveToPermanent(tempBucket, state.bucket, state.id);
    }

    return Right(undefined);
  }
}
