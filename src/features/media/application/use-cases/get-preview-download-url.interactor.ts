import { Injectable } from '@nestjs/common';

import { CachedMediaUrlService } from '../../adapters/media/media-url.service.js';
import { Right } from '@/infra/lib/box.js';
import type { MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetPreviewDownloadUrlInteractor {
  public constructor(private readonly mediaUrlService: CachedMediaUrlService) {}

  public async execute(command: { fileId: MediaId }) {
    const url = await this.mediaUrlService.getPreviewDownloadUrl(command.fileId);
    return Right(url);
  }
}
