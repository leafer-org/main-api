import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { type Job, Worker } from 'bullmq';

import {
  FileStorageService,
  MediaIdGenerator,
  MediaRepository,
  VideoDetailsRepository,
  VideoTranscoder,
} from '../../application/ports.js';
import { mediaApply, videoDetailsApply } from '../../domain/aggregates/media/apply.js';
import { mediaDecide } from '../../domain/aggregates/media/decide.js';
import { VIDEO_PROCESSING_QUEUE_NAME } from './bullmq-video-processing-queue.js';
import { MainConfigService } from '@/infra/config/service.js';
import { isLeft } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { MediaId } from '@/kernel/domain/ids.js';

type VideoProcessingJobData = {
  mediaId: MediaId;
  bucket: string;
};

@Injectable()
export class VideoProcessingWorker implements OnModuleInit, OnModuleDestroy {
  private worker!: Worker;
  private readonly logger = new Logger(VideoProcessingWorker.name);
  private readonly redisUrl: string;

  public constructor(
    @Inject(MainConfigService) config: MainConfigService,
    @Inject(FileStorageService) private readonly fileStorage: FileStorageService,
    @Inject(VideoTranscoder) private readonly transcoder: VideoTranscoder,
    @Inject(MediaRepository) private readonly mediaRepo: MediaRepository,
    @Inject(VideoDetailsRepository) private readonly videoDetailsRepo: VideoDetailsRepository,
    @Inject(MediaIdGenerator) private readonly idGen: MediaIdGenerator,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {
    this.redisUrl = config.get('REDIS_URL');
  }

  public onModuleInit(): void {
    this.worker = new Worker<VideoProcessingJobData>(
      VIDEO_PROCESSING_QUEUE_NAME,
      (job) => this.process(job),
      {
        connection: { url: this.redisUrl },
        concurrency: 1,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`, err.stack);
    });

    this.worker.on('completed', (job) => {
      this.logger.log(`Job ${job.id} completed for media ${job.data.mediaId}`);
    });
  }

  private async process(job: Job<VideoProcessingJobData>): Promise<void> {
    const { mediaId, bucket } = job.data;
    const workDir = join(tmpdir(), 'video-processing', mediaId);

    try {
      await mkdir(workDir, { recursive: true });

      this.logger.log(`Processing video ${mediaId}`);

      // 1. Initiate processing in domain
      await this.initiateProcessing(mediaId);

      // 2. Download original from S3 temp bucket
      const tempBucket = `${bucket}-temp`;
      const originalPath = join(workDir, 'original');
      await this.fileStorage.downloadToFile(tempBucket, mediaId, originalPath);
      await job.updateProgress(10);

      // 3. Transcode
      const outputDir = join(workDir, 'output');
      const result = await this.transcoder.transcode({
        localPath: originalPath,
        outputDir,
      });
      await job.updateProgress(70);

      // 4. Upload HLS output to S3
      const hlsPrefix = `video/${mediaId}`;
      await this.fileStorage.uploadDirectory(bucket, hlsPrefix, outputDir);
      await job.updateProgress(85);

      // 5. Create thumbnail media record and upload
      const thumbnailMediaId = this.idGen.generateMediaId();
      await this.fileStorage.uploadFile(
        bucket,
        thumbnailMediaId,
        result.thumbnailPath,
        'image/jpeg',
      );

      await this.txHost.startTransaction(async (tx) => {
        const thumbEvent = mediaDecide(null, {
          type: 'UploadMedia',
          id: thumbnailMediaId,
          mediaType: 'image',
          name: `thumbnail-${mediaId}.jpg`,
          bucket,
          mimeType: 'image/jpeg',
          now: this.clock.now(),
        });
        if (isLeft(thumbEvent)) throw new Error(`Thumbnail decide failed: ${thumbEvent.error}`);

        const thumbState = mediaApply(null, thumbEvent.value);
        if (!thumbState) throw new Error('Thumbnail apply returned null');

        const useResult = mediaDecide(thumbState, { type: 'UseMedia', now: this.clock.now() });
        if (isLeft(useResult)) throw new Error(`Thumbnail use failed: ${useResult.error}`);

        const finalThumbState = mediaApply(thumbState, useResult.value);
        if (!finalThumbState) throw new Error('Thumbnail use apply returned null');

        await this.mediaRepo.save(tx, finalThumbState);
      });
      await job.updateProgress(90);

      // 6. Complete processing in domain
      const hlsManifestKey = `${hlsPrefix}/master.m3u8`;
      await this.completeProcessing(mediaId, thumbnailMediaId, hlsManifestKey, result.duration);

      // 7. Move original from temp to permanent bucket
      await this.fileStorage.moveToPermanent(`${bucket}-temp`, bucket, mediaId);
      await job.updateProgress(100);

      this.logger.log(`Video ${mediaId} processed successfully`);
    } catch (error) {
      this.logger.error(
        `Video processing failed for ${mediaId}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.failProcessing(mediaId, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async initiateProcessing(mediaId: MediaId): Promise<void> {
    await this.txHost.startTransaction(async (tx) => {
      const state = await this.mediaRepo.findById(tx, mediaId);
      const details = await this.videoDetailsRepo.findByMediaId(tx, mediaId);

      const result = mediaDecide(state, { type: 'InitiateVideoProcessing', mediaId }, details);
      if (isLeft(result)) throw new Error(`InitiateVideoProcessing failed: ${result.error}`);

      const newDetails = videoDetailsApply(details, result.value);
      if (newDetails) await this.videoDetailsRepo.save(tx, newDetails);
    });
  }

  private async completeProcessing(
    mediaId: MediaId,
    thumbnailMediaId: MediaId,
    hlsManifestKey: string,
    duration: number,
  ): Promise<void> {
    await this.txHost.startTransaction(async (tx) => {
      const state = await this.mediaRepo.findById(tx, mediaId);
      const details = await this.videoDetailsRepo.findByMediaId(tx, mediaId);

      const result = mediaDecide(
        state,
        { type: 'CompleteVideoProcessing', mediaId, thumbnailMediaId, hlsManifestKey, duration },
        details,
      );
      if (isLeft(result)) throw new Error(`CompleteVideoProcessing failed: ${result.error}`);

      const newDetails = videoDetailsApply(details, result.value);
      if (newDetails) await this.videoDetailsRepo.save(tx, newDetails);
    });
  }

  private async failProcessing(mediaId: MediaId, reason: string): Promise<void> {
    try {
      await this.txHost.startTransaction(async (tx) => {
        const state = await this.mediaRepo.findById(tx, mediaId);
        const details = await this.videoDetailsRepo.findByMediaId(tx, mediaId);

        const result = mediaDecide(
          state,
          { type: 'FailVideoProcessing', mediaId, reason },
          details,
        );
        if (isLeft(result)) return;

        const newDetails = videoDetailsApply(details, result.value);
        if (newDetails) await this.videoDetailsRepo.save(tx, newDetails);
      });
    } catch (err) {
      this.logger.error(
        `Failed to mark video ${mediaId} as failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
