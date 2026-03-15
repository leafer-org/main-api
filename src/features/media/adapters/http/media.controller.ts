import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';

import { GetPreviewDownloadUrlInteractor } from '../../application/use-cases/get-preview-download-url.interactor.js';
import { RequestUploadInteractor } from '../../application/use-cases/upload/request-upload.interactor.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { MediaId } from '@/kernel/domain/ids.js';

@Public()
@Controller('media')
export class MediaController {
  public constructor(
    private readonly requestUpload: RequestUploadInteractor,
    private readonly getPreviewDownloadUrl: GetPreviewDownloadUrlInteractor,
  ) {}

  @Post('image/upload-request')
  @Public()
  @HttpCode(200)
  public async uploadRequest(
    @Body() body: PublicBody['mediaUploadRequest'],
  ): Promise<PublicResponse['mediaUploadRequest']> {
    const result = await this.requestUpload.execute({
      name: body.name,
      mimeType: body.mimeType,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'mediaUploadRequest'>(result.error.toResponse());
    }

    return result.value;
  }

@Get('preview/:mediaId')
  public async preview(@Param('mediaId') mediaId: string): Promise<PublicResponse['mediaPreview']> {
    const result = await this.getPreviewDownloadUrl.execute({
      fileId: MediaId.raw(mediaId),
    });

    const url = result.value;
    if (!url) {
      throw domainToHttpError<'mediaPreview'>({ 404: { type: 'file_not_found', isDomain: true } });
    }

    return { url };
  }
}
