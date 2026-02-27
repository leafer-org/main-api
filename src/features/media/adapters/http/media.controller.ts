import { Body, Controller, Get, Inject, NotFoundException, Param, Post } from '@nestjs/common';

import { GetPreviewDownloadUrlInteractor } from '../../application/queries/get-preview-download-url.interactor.js';
import { RequestUploadInteractor } from '../../application/use-cases/upload/request-upload.interactor.js';
import { UseFilesInteractor } from '../../application/use-cases/use-files.interactor.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { FileId } from '@/kernel/domain/ids.js';

@Controller('media')
export class MediaController {
  public constructor(
    private readonly requestUpload: RequestUploadInteractor,
    private readonly useFiles: UseFilesInteractor,
    private readonly getPreviewDownloadUrl: GetPreviewDownloadUrlInteractor,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  @Post('upload-request')
  public async uploadRequest(
    @Body() body: PublicBody['mediaUploadRequest'],
  ): Promise<PublicResponse['mediaUploadRequest']> {
    const result = await this.requestUpload.execute({
      name: body.name,
      bucket: body.bucket,
      mimeType: body.mimeType,
    });

    if (isLeft(result)) throw result.error;
    return result.value;
  }

  @Post('confirm-upload')
  public async confirmUpload(
    @Body() body: PublicBody['mediaConfirmUpload'],
  ): Promise<PublicResponse['mediaConfirmUpload']> {
    return this.txHost.startTransaction(async (tx) => {
      const result = await this.useFiles.execute({
        tx,
        fileIds: body.fileIds as FileId[],
      });

      if (isLeft(result)) throw result.error;
      return {} as Record<string, never>;
    });
  }

  @Get('preview/:mediaId')
  public async preview(@Param('mediaId') mediaId: string): Promise<PublicResponse['mediaPreview']> {
    const result = await this.getPreviewDownloadUrl.execute({
      fileId: mediaId as FileId,
    });

    const url = result.value;
    if (!url) throw new NotFoundException('File not found');
    return { url };
  }
}
