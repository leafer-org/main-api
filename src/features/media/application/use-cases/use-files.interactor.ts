import { Injectable } from '@nestjs/common';

import { fileApply } from '../../domain/aggregates/file/apply.js';
import { fileDecide } from '../../domain/aggregates/file/decide.js';
import { FileNotFoundError } from '../../domain/aggregates/file/errors.js';
import type { FileRepository, FileStorageService } from '../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import type { Clock } from '@/infra/lib/clock.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { FileId } from '@/kernel/domain/ids.js';

@Injectable()
export class UseFilesInteractor {
  public constructor(
    private readonly clock: Clock,
    private readonly fileRepository: FileRepository,
    private readonly fileStorage: FileStorageService,
  ) {}

  public async execute(command: { tx: Transaction; fileIds: FileId[] }) {
    const now = this.clock.now();
    const { tx, fileIds } = command;

    const states = await this.fileRepository.findByIds(tx, fileIds);

    for (const fileId of fileIds) {
      if (!states.has(fileId)) return Left(new FileNotFoundError());
    }

    for (const fileId of fileIds) {
      const state = states.get(fileId)!;
      const eventEither = fileDecide(state, { type: 'UseFile', now });
      if (isLeft(eventEither)) return eventEither;

      const newState = fileApply(state, eventEither.value);
      if (!newState) throw new Error('Unexpected null state after file.used');

      await this.fileRepository.save(tx, newState);

      const tempBucket = `${state.bucket}-temp`;
      await this.fileStorage.moveToPermanent(tempBucket, state.bucket, state.id);
    }

    return Right(undefined);
  }
}
