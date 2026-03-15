import { Injectable } from '@nestjs/common';

import { CachedMediaUrlService } from '../../adapters/media/media-url.service.js';
import { Right } from '@/infra/lib/box.js';
import type { GetDownloadUrlOptions } from '@/kernel/application/ports/media.js';
import type { MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetDownloadUrlInteractor {
  public constructor(private readonly mediaUrlService: CachedMediaUrlService) {}

  public async execute(command: { fileId: MediaId; options: GetDownloadUrlOptions }) {
    const url = await this.mediaUrlService.getDownloadUrl(command.fileId, command.options);
    return Right(url);
  }

  public async executeBatch(command: {
    requests: { fileId: MediaId; options: GetDownloadUrlOptions }[];
  }) {
    const urls = await this.mediaUrlService.getDownloadUrls(command.requests);
    return Right(urls);
  }
}
