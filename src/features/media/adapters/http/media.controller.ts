import { Body, Controller, Get, Inject, NotFoundException, Param, Post } from '@nestjs/common';

import { GetPreviewDownloadUrlInteractor } from '../../application/queries/get-preview-download-url.interactor.js';
import { RequestUploadInteractor } from '../../application/use-cases/upload/request-upload.interactor.js';
import { UseFilesInteractor } from '../../application/use-cases/use-files.interactor.js';
import { MainConfigService } from '@/infra/config/service.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { MediaService } from '@/kernel/application/ports/media.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { FileId } from '@/kernel/domain/ids.js';

@Controller('media')
export class MediaController {
  private readonly avatarBucket: string;

  public constructor(
    private readonly requestUpload: RequestUploadInteractor,
    private readonly useFiles: UseFilesInteractor,
    private readonly getPreviewDownloadUrl: GetPreviewDownloadUrlInteractor,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
    @Inject(MediaService)
    private readonly mediaService: MediaService,
    config: MainConfigService,
  ) {
    this.avatarBucket = config.get('MEDIA_BUCKET_PUBLIC') ?? 'avatars';
  }

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
        fileIds: body.fileIds.map(FileId.raw),
      });

      if (isLeft(result)) throw result.error;
      return {} as Record<string, never>;
    });
  }

  @Get('preview/:mediaId')
  public async preview(@Param('mediaId') mediaId: string): Promise<PublicResponse['mediaPreview']> {
    const result = await this.getPreviewDownloadUrl.execute({
      fileId: FileId.raw(mediaId),
    });

    const url = result.value;
    if (!url) throw new NotFoundException('File not found');
    return { url };
  }

  @Post('avatar/upload-request')
  public async avatarUploadRequest(
    @Body() body: PublicBody['avatarUploadRequest'],
  ): Promise<PublicResponse['avatarUploadRequest']> {
    const mimeType = body.contentType ?? 'image/jpeg';
    const result = await this.requestUpload.execute({
      name: 'avatar',
      bucket: this.avatarBucket,
      mimeType,
    });

    if (isLeft(result)) throw result.error;

    return {
      bucket: this.avatarBucket,
      objectKey: result.value.fileId,
      mediaId: result.value.fileId,
      visibility: 'PUBLIC',
      contentType: mimeType,
      url: result.value.uploadUrl,
    };
  }

  @Post('avatar/preview-upload')
  public async avatarPreviewUpload(
    @Body() body: PublicBody['avatarPreviewUpload'],
  ): Promise<PublicResponse['avatarPreviewUpload']> {
    const fileId = FileId.raw(body.mediaId);

    const [largeUrl, mediumUrl, smallUrl, thumbUrl] = await Promise.all([
      this.mediaService.getPreviewDownloadUrl(fileId),
      this.mediaService.getPreviewDownloadUrl(fileId),
      this.mediaService.getPreviewDownloadUrl(fileId),
      this.mediaService.getPreviewDownloadUrl(fileId),
    ]);

    if (!largeUrl || !mediumUrl || !smallUrl || !thumbUrl) {
      throw new NotFoundException('File not found');
    }

    return { largeUrl, mediumUrl, smallUrl, thumbUrl };
  }
}
