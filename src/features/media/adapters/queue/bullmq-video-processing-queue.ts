import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

import { VideoProcessingQueue } from '../../application/ports.js';
import { MainConfigService } from '@/infra/config/service.js';
import type { MediaId } from '@/kernel/domain/ids.js';

export const VIDEO_PROCESSING_QUEUE_NAME = 'video-processing';

@Injectable()
export class BullMQVideoProcessingQueue implements VideoProcessingQueue, OnModuleDestroy {
  private readonly queue: Queue;

  public constructor(
    @Inject(MainConfigService)
    config: MainConfigService,
  ) {
    this.queue = new Queue(VIDEO_PROCESSING_QUEUE_NAME, {
      connection: { url: config.get('REDIS_URL') },
    });
  }

  public async enqueue(mediaId: MediaId, bucket: string): Promise<void> {
    await this.queue.add('transcode', { mediaId, bucket });
  }

  public async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
