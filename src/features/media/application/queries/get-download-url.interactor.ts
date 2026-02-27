import { Injectable } from '@nestjs/common';

import type { MediaUrlService } from '../ports.js';
import { Right } from '@/infra/lib/box.js';
import type { FileId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetDownloadUrlInteractor {
  public constructor(private readonly mediaUrlService: MediaUrlService) {}

  public async execute(command: { fileId: FileId }) {
    const url = await this.mediaUrlService.getDownloadUrl(command.fileId);
    return Right(url);
  }

  public async executeBatch(command: { fileIds: FileId[] }) {
    const urls = await this.mediaUrlService.getDownloadUrls(command.fileIds);
    return Right(urls);
  }
}
