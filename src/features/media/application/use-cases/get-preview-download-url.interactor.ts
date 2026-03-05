import { Injectable } from '@nestjs/common';

import { CachedMediaUrlService } from '../../adapters/media/media-url.service.js';
import { Right } from '@/infra/lib/box.js';
import type { FileId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetPreviewDownloadUrlInteractor {
  public constructor(private readonly mediaUrlService: CachedMediaUrlService) {}

  public async execute(command: { fileId: FileId }) {
    const url = await this.mediaUrlService.getPreviewDownloadUrl(command.fileId);
    return Right(url);
  }
}
