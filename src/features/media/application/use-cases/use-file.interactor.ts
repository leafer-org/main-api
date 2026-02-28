import { Inject, Injectable } from '@nestjs/common';

import { fileApply } from '../../domain/aggregates/file/apply.js';
import { fileDecide } from '../../domain/aggregates/file/decide.js';
import { FileNotFoundError } from '../../domain/aggregates/file/errors.js';
import { FileRepository, FileStorageService } from '../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { FileId } from '@/kernel/domain/ids.js';

@Injectable()
export class UseFileInteractor {
  public constructor(
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(FileRepository)
    private readonly fileRepository: FileRepository,
    @Inject(FileStorageService)
    private readonly fileStorage: FileStorageService,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  public async execute(command: { fileId: FileId }) {
    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.fileRepository.findById(tx, command.fileId);
      if (!state) return Left(new FileNotFoundError());

      const eventEither = fileDecide(state, {
        type: 'UseFile',
        now,
      });

      if (isLeft(eventEither)) return eventEither;

      const newState = fileApply(state, eventEither.value);
      if (!newState) throw new Error('Unexpected null state after file.used');

      await this.fileRepository.save(tx, newState);

      const tempBucket = `${state.bucket}-temp`;
      await this.fileStorage.moveToPermanent(tempBucket, state.bucket, state.id);

      return Right(undefined);
    });
  }
}
