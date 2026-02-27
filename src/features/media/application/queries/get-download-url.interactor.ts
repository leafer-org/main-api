import { Injectable } from '@nestjs/common';

import type { DownloadUrlOptions, MediaUrlService } from '../ports.js';
import { Right } from '@/infra/lib/box.js';
import type { FileId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetDownloadUrlInteractor {
  public constructor(private readonly mediaUrlService: MediaUrlService) {}

  public async execute(command: { fileId: FileId; options: DownloadUrlOptions }) {
    const url = await this.mediaUrlService.getDownloadUrl(command.fileId, command.options);
    return Right(url);
  }

  public async executeBatch(command: { fileIds: FileId[]; options: DownloadUrlOptions }) {
    const urls = await this.mediaUrlService.getDownloadUrls(command.fileIds, command.options);
    return Right(urls);
  }
}
