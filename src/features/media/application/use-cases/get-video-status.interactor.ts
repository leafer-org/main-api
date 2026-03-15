import { Inject, Injectable } from '@nestjs/common';

import { VideoDetailsRepository } from '../ports.js';
import { Right } from '@/infra/lib/box.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetVideoStatusInteractor {
  public constructor(
    @Inject(VideoDetailsRepository)
    private readonly videoDetailsRepository: VideoDetailsRepository,
  ) {}

  public async execute(command: { mediaId: MediaId }) {
    const noTx = NO_TRANSACTION as Transaction;
    const details = await this.videoDetailsRepository.findByMediaId(noTx, command.mediaId);

    if (!details) return Right(null);

    return Right({
      mediaId: details.mediaId,
      processingStatus: details.processingStatus,
      duration: details.duration,
    });
  }
}
