import { Inject, Injectable } from '@nestjs/common';

import { fileApply } from '../../domain/aggregates/file/apply.js';
import { fileDecide } from '../../domain/aggregates/file/decide.js';
import { FileNotFoundError } from '../../domain/aggregates/file/errors.js';
import { FileRepository, FileStorageService } from '../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { FileId } from '@/kernel/domain/ids.js';

@Injectable()
export class FreeFilesInteractor {
  public constructor(
    @Inject(FileRepository)
    private readonly fileRepository: FileRepository,
    @Inject(FileStorageService)
    private readonly fileStorage: FileStorageService,
  ) {}

  public async execute(command: { tx: Transaction; fileIds: FileId[] }) {
    const { tx, fileIds } = command;

    const states = await this.fileRepository.findByIds(tx, fileIds);

    for (const fileId of fileIds) {
      if (!states.has(fileId)) return Left(new FileNotFoundError());
    }

    for (const fileId of fileIds) {
      const state = states.get(fileId);
      if (!state) return Left(new FileNotFoundError());
      const eventEither = fileDecide(state, { type: 'FreeFile' });
      if (isLeft(eventEither)) return eventEither;

      fileApply(state, eventEither.value);
    }

    await this.fileRepository.deleteByIds(tx, fileIds);

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
