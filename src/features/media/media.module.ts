import { Module } from '@nestjs/common';

import { DrizzleFileRepository } from './adapters/db/file.repository.js';
import { CachedMediaUrlService } from './adapters/media/media-url.service.js';
import { S3FileStorageService } from './adapters/s3/file-storage.service.js';
import { S3ClientService } from './adapters/s3/s3-client.service.js';
import { GetDownloadUrlInteractor } from './application/queries/get-download-url.interactor.js';
import { FreeFileInteractor } from './application/use-cases/free-file.interactor.js';
import { RequestUploadInteractor } from './application/use-cases/upload/request-upload.interactor.js';
import { UseFileInteractor } from './application/use-cases/use-file.interactor.js';
import { MainConfigModule } from '@/infra/config/module.js';
import { MainDbModule } from '@/infra/db/module.js';

@Module({
  imports: [MainDbModule, MainConfigModule],
  providers: [
    // infrastructure
    S3ClientService,
    DrizzleFileRepository,
    S3FileStorageService,
    CachedMediaUrlService,
    // use cases
    RequestUploadInteractor,
    UseFileInteractor,
    FreeFileInteractor,
    // queries
    GetDownloadUrlInteractor,
  ],
  exports: [CachedMediaUrlService, UseFileInteractor, FreeFileInteractor],
})
export class MediaModule {}
