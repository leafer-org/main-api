import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { MediaRepository } from '../../../application/ports.js';
import type { MediaState } from '../../../domain/aggregates/media/state.js';
import { media } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleMediaRepository implements MediaRepository {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async findById(tx: Transaction, id: MediaId): Promise<MediaState | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(media).where(eq(media.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return {
      id: MediaId.raw(row.id),
      type: row.type as MediaState['type'],
      name: row.name,
      bucket: row.bucket,
      mimeType: row.mimeType,
      isTemporary: row.isTemporary,
      createdAt: row.createdAt,
    };
  }

  public async findByIds(tx: Transaction, ids: MediaId[]): Promise<Map<MediaId, MediaState>> {
    if (ids.length === 0) return new Map();

    const db = this.txHost.get(tx);
    const rows = await db.select().from(media).where(inArray(media.id, ids));
    const map = new Map<MediaId, MediaState>();

    for (const row of rows) {
      map.set(MediaId.raw(row.id), {
        id: MediaId.raw(row.id),
        type: row.type as MediaState['type'],
        name: row.name,
        bucket: row.bucket,
        mimeType: row.mimeType,
        isTemporary: row.isTemporary,
        createdAt: row.createdAt,
      });
    }

    return map;
  }

  public async save(tx: Transaction, state: MediaState): Promise<void> {
    const db = this.txHost.get(tx);
    await db
      .insert(media)
      .values({
        id: state.id,
        type: state.type,
        name: state.name,
        bucket: state.bucket,
        mimeType: state.mimeType,
        isTemporary: state.isTemporary,
        createdAt: state.createdAt,
      })
      .onConflictDoUpdate({
        target: media.id,
        set: {
          type: state.type,
          name: state.name,
          bucket: state.bucket,
          mimeType: state.mimeType,
          isTemporary: state.isTemporary,
        },
      });
  }

  public async deleteById(tx: Transaction, id: MediaId): Promise<void> {
    const db = this.txHost.get(tx);
    await db.delete(media).where(eq(media.id, id));
  }

  public async deleteByIds(tx: Transaction, ids: MediaId[]): Promise<void> {
    if (ids.length === 0) return;

    const db = this.txHost.get(tx);
    await db.delete(media).where(inArray(media.id, ids));
  }
}
