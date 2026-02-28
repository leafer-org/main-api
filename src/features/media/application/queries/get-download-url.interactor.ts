import { Injectable } from '@nestjs/common';

import { CachedMediaUrlService } from '../../adapters/media/media-url.service.js';
import { Right } from '@/infra/lib/box.js';
import type { GetDownloadUrlOptions } from '@/kernel/application/ports/media.js';
import type { FileId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetDownloadUrlInteractor {
  public constructor(private readonly mediaUrlService: CachedMediaUrlService) {}

  public async execute(command: { fileId: FileId; options: GetDownloadUrlOptions }) {
    const url = await this.mediaUrlService.getDownloadUrl(command.fileId, command.options);
    return Right(url);
  }

  public async executeBatch(command: {
    requests: { fileId: FileId; options: GetDownloadUrlOptions }[];
  }) {
    const urls = await this.mediaUrlService.getDownloadUrls(command.requests);
    return Right(urls);
  }
}
