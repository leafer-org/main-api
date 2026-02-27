import { Module } from '@nestjs/common';

import { DrizzleFileRepository } from './adapters/db/file.repository.js';
import { MediaController } from './adapters/http/media.controller.js';
import { HmacImageProxyUrlSigner } from './adapters/media/image-proxy-url-signer.js';
import { MediaServiceAdapter } from './adapters/media/media.service.js';
import {
  CachedMediaUrlService,
  IMAGE_PROXY_URL_SIGNER,
} from './adapters/media/media-url.service.js';
import { S3FileStorageService } from './adapters/s3/file-storage.service.js';
import { S3ClientService } from './adapters/s3/s3-client.service.js';
import { GetDownloadUrlInteractor } from './application/queries/get-download-url.interactor.js';
import { GetPreviewDownloadUrlInteractor } from './application/queries/get-preview-download-url.interactor.js';
import { FreeFileInteractor } from './application/use-cases/free-file.interactor.js';
import { FreeFilesInteractor } from './application/use-cases/free-files.interactor.js';
import { RequestUploadInteractor } from './application/use-cases/upload/request-upload.interactor.js';
import { UseFileInteractor } from './application/use-cases/use-file.interactor.js';
import { UseFilesInteractor } from './application/use-cases/use-files.interactor.js';
import { MainConfigModule } from '@/infra/config/module.js';
import { MainConfigService } from '@/infra/config/service.js';
import { MediaService } from '@/kernel/application/ports/media.js';

@Module({
  imports: [MainConfigModule],
  controllers: [MediaController],
  providers: [
    // infrastructure
    S3ClientService,
    DrizzleFileRepository,
    S3FileStorageService,
    CachedMediaUrlService,
    {
      provide: IMAGE_PROXY_URL_SIGNER,
      useFactory: (config: MainConfigService) => {
        const secret = config.get('MEDIA_IMAGE_PROXY_SECRET');
        return secret ? new HmacImageProxyUrlSigner(secret) : null;
      },
      inject: [MainConfigService],
    },
    // shared kernel port
    { provide: MediaService, useClass: MediaServiceAdapter },
    // use cases
    RequestUploadInteractor,
    UseFileInteractor,
    UseFilesInteractor,
    FreeFileInteractor,
    FreeFilesInteractor,
    // queries
    GetDownloadUrlInteractor,
    GetPreviewDownloadUrlInteractor,
  ],
  exports: [MediaService],
})
export class MediaModule {}
