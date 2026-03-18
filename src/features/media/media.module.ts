import { Global, Module } from '@nestjs/common';

import { DrizzleMediaRepository } from './adapters/db/repositories/file.repository.js';
import { DrizzleVideoDetailsRepository } from './adapters/db/repositories/video-details.repository.js';
import { MediaController } from './adapters/http/media.controller.js';
import { UuidMediaIdGenerator } from './adapters/id/file-id-generator.service.js';
import { ImgproxyUrlSigner } from './adapters/media/image-proxy-url-signer.js';
import { MediaServiceAdapter } from './adapters/media/media.service.js';
import {
  CachedMediaUrlService,
  IMAGE_PROXY_URL_SIGNER,
} from './adapters/media/media-url.service.js';
import { BullMQVideoProcessingQueue } from './adapters/queue/bullmq-video-processing-queue.js';
import { RedisVideoProcessingProgress } from './adapters/redis/video-processing-progress.adapter.js';
import { S3FileStorageService } from './adapters/s3/file-storage.service.js';
import { S3ClientService } from './adapters/s3/s3-client.service.js';
import {
  FileStorageService,
  MediaConfig,
  MediaIdGenerator,
  MediaRepository,
  VideoDetailsRepository,
  VideoProcessingProgress,
  VideoProcessingQueue,
} from './application/ports.js';
import { FreeFileInteractor } from './application/use-cases/free-file.interactor.js';
import { FreeFilesInteractor } from './application/use-cases/free-files.interactor.js';
import { GetDownloadUrlInteractor } from './application/use-cases/get-download-url.interactor.js';
import { GetPreviewDownloadUrlInteractor } from './application/use-cases/get-preview-download-url.interactor.js';
import { GetVideoPreviewInteractor } from './application/use-cases/get-video-preview.interactor.js';
import { CompleteVideoUploadInteractor } from './application/use-cases/upload/complete-video-upload.interactor.js';
import { InitVideoUploadInteractor } from './application/use-cases/upload/init-video-upload.interactor.js';
import { RequestUploadInteractor } from './application/use-cases/upload/request-upload.interactor.js';
import { UseFileInteractor } from './application/use-cases/use-file.interactor.js';
import { UseFilesInteractor } from './application/use-cases/use-files.interactor.js';
import { MainConfigModule } from '@/infra/config/module.js';
import { MainConfigService } from '@/infra/config/service.js';
import { Clock, SystemClock } from '@/infra/lib/clock.js';
import { MediaService } from '@/kernel/application/ports/media.js';

export const MAX_VIDEO_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export const mediaConfigFactory = {
  provide: MediaConfig,
  useFactory: (config: MainConfigService) => ({
    publicBucket: config.get('MEDIA_BUCKET_PUBLIC') ?? 'media-public',
    maxFileSize: config.get('MEDIA_MAX_FILE_SIZE'),
    maxVideoFileSize: MAX_VIDEO_FILE_SIZE,
  }),
  inject: [MainConfigService],
};

@Global()
@Module({
  imports: [MainConfigModule],
  controllers: [MediaController],
  providers: [
    // infrastructure
    S3ClientService,
    CachedMediaUrlService,
    { provide: MediaRepository, useClass: DrizzleMediaRepository },
    { provide: VideoDetailsRepository, useClass: DrizzleVideoDetailsRepository },
    { provide: FileStorageService, useClass: S3FileStorageService },
    { provide: MediaIdGenerator, useClass: UuidMediaIdGenerator },
    { provide: VideoProcessingQueue, useClass: BullMQVideoProcessingQueue },
    { provide: VideoProcessingProgress, useClass: RedisVideoProcessingProgress },
    { provide: Clock, useClass: SystemClock },
    mediaConfigFactory,
    {
      provide: IMAGE_PROXY_URL_SIGNER,
      useFactory: (config: MainConfigService) => {
        const key = config.get('MEDIA_IMAGE_PROXY_KEY');
        const salt = config.get('MEDIA_IMAGE_PROXY_SALT');
        return key && salt ? new ImgproxyUrlSigner(key, salt) : null;
      },
      inject: [MainConfigService],
    },
    // shared kernel port
    { provide: MediaService, useClass: MediaServiceAdapter },
    // use cases
    RequestUploadInteractor,
    InitVideoUploadInteractor,
    CompleteVideoUploadInteractor,
    UseFileInteractor,
    UseFilesInteractor,
    FreeFileInteractor,
    FreeFilesInteractor,
    GetDownloadUrlInteractor,
    GetPreviewDownloadUrlInteractor,
    GetVideoPreviewInteractor,
  ],
  exports: [MediaService],
})
export class MediaModule {}
