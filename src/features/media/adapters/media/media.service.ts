import { Injectable } from '@nestjs/common';

import { FreeFilesInteractor } from '../../application/use-cases/free-files.interactor.js';
import { GetDownloadUrlInteractor } from '../../application/use-cases/get-download-url.interactor.js';
import { GetPreviewDownloadUrlInteractor } from '../../application/use-cases/get-preview-download-url.interactor.js';
import { UseFilesInteractor } from '../../application/use-cases/use-files.interactor.js';
import { isLeft, unwrap } from '@/infra/lib/box.js';
import type { GetDownloadUrlOptions } from '@/kernel/application/ports/media.js';
import { MediaService } from '@/kernel/application/ports/media.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class MediaServiceAdapter extends MediaService {
  public constructor(
    private readonly downloadUrlQuery: GetDownloadUrlInteractor,
    private readonly previewUrlQuery: GetPreviewDownloadUrlInteractor,
    private readonly useFilesUseCase: UseFilesInteractor,
    private readonly freeFilesUseCase: FreeFilesInteractor,
  ) {
    super();
  }

  public async getDownloadUrl(
    fileId: MediaId,
    options: GetDownloadUrlOptions,
  ): Promise<string | null> {
    const result = await this.downloadUrlQuery.execute({ fileId, options });
    return unwrap(result);
  }

  public async getDownloadUrls(
    requests: { fileId: MediaId; options: GetDownloadUrlOptions }[],
  ): Promise<(string | null)[]> {
    const result = await this.downloadUrlQuery.executeBatch({ requests });
    return unwrap(result);
  }

  public async getPreviewDownloadUrl(fileId: MediaId): Promise<string | null> {
    const result = await this.previewUrlQuery.execute({ fileId });
    return unwrap(result);
  }

  public async useFiles(tx: Transaction, fileIds: MediaId[]): Promise<void> {
    const result = await this.useFilesUseCase.execute({ tx, fileIds });
    if (isLeft(result)) throw result.error;
  }

  public async freeFiles(tx: Transaction, fileIds: MediaId[]): Promise<void> {
    const result = await this.freeFilesUseCase.execute({ tx, fileIds });
    if (isLeft(result)) throw result.error;
  }
}
