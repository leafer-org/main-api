import { Global, Module } from '@nestjs/common';

import { DrizzleMediaRepository } from './adapters/db/repositories/file.repository.js';
import { DrizzleVideoDetailsRepository } from './adapters/db/repositories/video-details.repository.js';
import { UuidMediaIdGenerator } from './adapters/id/file-id-generator.service.js';
import { VideoProcessingWorker } from './adapters/queue/video-processing.worker.js';
import { S3FileStorageService } from './adapters/s3/file-storage.service.js';
import { S3ClientService } from './adapters/s3/s3-client.service.js';
import { FFmpegVideoTranscoder } from './adapters/transcoder/ffmpeg-video-transcoder.js';
import {
  FileStorageService,
  MediaIdGenerator,
  MediaRepository,
  VideoDetailsRepository,
  VideoTranscoder,
} from './application/ports.js';
import { mediaConfigFactory } from './media.module.js';
import { MainConfigModule } from '@/infra/config/module.js';
import { Clock, SystemClock } from '@/infra/lib/clock.js';

@Global()
@Module({
  imports: [MainConfigModule],
  providers: [
    S3ClientService,
    { provide: MediaRepository, useClass: DrizzleMediaRepository },
    { provide: VideoDetailsRepository, useClass: DrizzleVideoDetailsRepository },
    { provide: FileStorageService, useClass: S3FileStorageService },
    { provide: MediaIdGenerator, useClass: UuidMediaIdGenerator },
    { provide: Clock, useClass: SystemClock },
    mediaConfigFactory,
    { provide: VideoTranscoder, useClass: FFmpegVideoTranscoder },
    VideoProcessingWorker,
  ],
})
export class MediaProcessorModule {}
