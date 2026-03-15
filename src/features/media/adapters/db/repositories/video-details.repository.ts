import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { VideoDetailsRepository } from '../../../application/ports.js';
import type { VideoDetails } from '../../../domain/aggregates/media/video-details.js';
import { videoDetails } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleVideoDetailsRepository implements VideoDetailsRepository {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async findByMediaId(tx: Transaction, mediaId: MediaId): Promise<VideoDetails | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(videoDetails).where(eq(videoDetails.mediaId, mediaId)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return {
      mediaId: MediaId.raw(row.mediaId),
      processingStatus: row.processingStatus as VideoDetails['processingStatus'],
      thumbnailMediaId: row.thumbnailMediaId ? MediaId.raw(row.thumbnailMediaId) : null,
      hlsManifestKey: row.hlsManifestKey,
      duration: row.duration,
    };
  }

  public async save(tx: Transaction, details: VideoDetails): Promise<void> {
    const db = this.txHost.get(tx);
    await db
      .insert(videoDetails)
      .values({
        mediaId: details.mediaId,
        processingStatus: details.processingStatus,
        thumbnailMediaId: details.thumbnailMediaId,
        hlsManifestKey: details.hlsManifestKey,
        duration: details.duration,
      })
      .onConflictDoUpdate({
        target: videoDetails.mediaId,
        set: {
          processingStatus: details.processingStatus,
          thumbnailMediaId: details.thumbnailMediaId,
          hlsManifestKey: details.hlsManifestKey,
          duration: details.duration,
        },
      });
  }
}
