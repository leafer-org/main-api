import { Inject, Injectable } from '@nestjs/common';

import { MediaEntity } from '../../domain/aggregates/media/entity.js';
import { MediaNotFoundError } from '../../domain/aggregates/media/errors.js';
import { FileStorageService, MediaRepository } from '../ports.js';
import { Left, Right } from '@/infra/lib/box.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class FreeFilesInteractor {
  public constructor(
    @Inject(MediaRepository)
    private readonly mediaRepository: MediaRepository,
    @Inject(FileStorageService)
    private readonly fileStorage: FileStorageService,
  ) {}

  public async execute(command: { tx: Transaction; fileIds: MediaId[] }) {
    const { tx, fileIds } = command;

    const states = await this.mediaRepository.findByIds(tx, fileIds);

    for (const fileId of fileIds) {
      if (!states.has(fileId)) return Left(new MediaNotFoundError());
    }

    for (const fileId of fileIds) {
      const state = states.get(fileId);
      if (!state) return Left(new MediaNotFoundError());
      MediaEntity.free(state);
    }

    await this.mediaRepository.deleteByIds(tx, fileIds);

    for (const fileId of fileIds) {
      const state = states.get(fileId);
      if (!state) continue;
      const bucket = state.isTemporary ? `${state.bucket}-temp` : state.bucket;
      // biome-ignore lint/performance/noAwaitInLoops: sequential deletion is intentional
      await this.fileStorage.delete(bucket, state.id);
    }

    return Right(undefined);
  }
}
