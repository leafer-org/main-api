import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';

import { GetPreviewDownloadUrlInteractor } from '../../application/queries/get-preview-download-url.interactor.js';
import { RequestUploadInteractor } from '../../application/use-cases/upload/request-upload.interactor.js';
import { UseFilesInteractor } from '../../application/use-cases/use-files.interactor.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { FileId } from '@/kernel/domain/ids.js';

@Public()
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
  @Public()
  @HttpCode(200)
  public async uploadRequest(
    @Body() body: PublicBody['mediaUploadRequest'],
  ): Promise<PublicResponse['mediaUploadRequest']> {
    const result = await this.requestUpload.execute({
      name: body.name,
      bucket: body.bucket,
      mimeType: body.mimeType,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'mediaUploadRequest'>(result.error.toResponse());
    }

    return result.value;
  }

  @Post('confirm-upload')
  @HttpCode(200)
  public async confirmUpload(
    @Body() body: PublicBody['mediaConfirmUpload'],
  ): Promise<PublicResponse['mediaConfirmUpload']> {
    return this.txHost.startTransaction(async (tx) => {
      const result = await this.useFiles.execute({
        tx,
        fileIds: body.fileIds.map(FileId.raw),
      });

      if (isLeft(result)) {
        throw domainToHttpError<'mediaConfirmUpload'>(result.error.toResponse());
      }

      return {} as Record<string, never>;
    });
  }

  @Get('preview/:mediaId')
  public async preview(@Param('mediaId') mediaId: string): Promise<PublicResponse['mediaPreview']> {
    const result = await this.getPreviewDownloadUrl.execute({
      fileId: FileId.raw(mediaId),
    });

    const url = result.value;
    if (!url) {
      throw domainToHttpError<'mediaPreview'>({ 404: { type: 'file_not_found', isDomain: true } });
    }

    return { url };
  }
}
