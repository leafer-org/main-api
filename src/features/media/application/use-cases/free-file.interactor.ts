import { Inject, Injectable } from '@nestjs/common';

import { fileApply } from '../../domain/aggregates/file/apply.js';
import { fileDecide } from '../../domain/aggregates/file/decide.js';
import { FileNotFoundError } from '../../domain/aggregates/file/errors.js';
import { FileRepository, FileStorageService } from '../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { FileId } from '@/kernel/domain/ids.js';

@Injectable()
export class FreeFileInteractor {
  public constructor(
    @Inject(FileRepository)
    private readonly fileRepository: FileRepository,
    @Inject(FileStorageService)
    private readonly fileStorage: FileStorageService,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  public async execute(command: { fileId: FileId }) {
    return this.txHost.startTransaction(async (tx) => {
      const state = await this.fileRepository.findById(tx, command.fileId);
      if (!state) return Left(new FileNotFoundError());

      const eventEither = fileDecide(state, { type: 'FreeFile' });

      if (isLeft(eventEither)) return eventEither;

      // apply returns null for file.freed — aggregate is deleted
      fileApply(state, eventEither.value);

      await this.fileRepository.deleteById(tx, state.id);

      const bucket = state.isTemporary ? `${state.bucket}-temp` : state.bucket;
      await this.fileStorage.delete(bucket, state.id);

      return Right(undefined);
    });
  }
}
