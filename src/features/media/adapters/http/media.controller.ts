import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';

import { GetPreviewDownloadUrlInteractor } from '../../application/use-cases/get-preview-download-url.interactor.js';
import { GetVideoPreviewInteractor } from '../../application/use-cases/get-video-preview.interactor.js';
import { CompleteVideoUploadInteractor } from '../../application/use-cases/upload/complete-video-upload.interactor.js';
import { InitVideoUploadInteractor } from '../../application/use-cases/upload/init-video-upload.interactor.js';
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
    private readonly initVideoUpload: InitVideoUploadInteractor,
    private readonly completeVideoUpload: CompleteVideoUploadInteractor,
    private readonly getPreviewDownloadUrl: GetPreviewDownloadUrlInteractor,
    private readonly getVideoPreview: GetVideoPreviewInteractor,
  ) {}

  @Post('image/upload-request')
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

  @Post('video/upload-init')
  @HttpCode(200)
  public async videoUploadInit(
    @Body() body: PublicBody['mediaVideoUploadInit'],
  ): Promise<PublicResponse['mediaVideoUploadInit']> {
    const result = await this.initVideoUpload.execute({
      name: body.name,
      mimeType: body.mimeType,
      fileSize: body.fileSize,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'mediaVideoUploadInit'>(result.error.toResponse());
    }

    return result.value;
  }

  @Post('video/upload-complete')
  @HttpCode(200)
  public async videoUploadComplete(
    @Body() body: PublicBody['mediaVideoUploadComplete'],
  ): Promise<PublicResponse['mediaVideoUploadComplete']> {
    const result = await this.completeVideoUpload.execute({
      mediaId: MediaId.raw(body.mediaId),
      uploadId: body.uploadId,
      parts: body.parts,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'mediaVideoUploadComplete'>(result.error.toResponse());
    }

    return result.value;
  }

  @Get('video/preview/:mediaId')
  public async videoPreview(
    @Param('mediaId') mediaId: string,
  ): Promise<PublicResponse['mediaVideoPreview']> {
    const result = await this.getVideoPreview.execute({
      mediaId: MediaId.raw(mediaId),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'mediaVideoPreview'>(result.error.toResponse());
    }

    const data = result.value;
    if (!data) {
      throw domainToHttpError<'mediaVideoPreview'>({ 404: { type: 'media_not_found', isDomain: true } });
    }

    return data;
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
