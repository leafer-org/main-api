import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { MediaRepository } from '../../../application/ports.js';
import type { MediaEntity } from '../../../domain/aggregates/media/entity.js';
import { media } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { MediaId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleMediaRepository implements MediaRepository {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async findById(tx: Transaction, id: MediaId): Promise<MediaEntity | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(media).where(eq(media.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return {
      id: MediaId.raw(row.id),
      type: row.type as MediaEntity['type'],
      name: row.name,
      bucket: row.bucket,
      mimeType: row.mimeType,
      isTemporary: row.isTemporary,
      createdAt: row.createdAt,
      width: row.width,
      height: row.height,
      verifiedMimeType: row.verifiedMimeType,
    };
  }

  public async findByIds(tx: Transaction, ids: MediaId[]): Promise<Map<MediaId, MediaEntity>> {
    if (ids.length === 0) return new Map();

    const db = this.txHost.get(tx);
    const rows = await db.select().from(media).where(inArray(media.id, ids));
    const map = new Map<MediaId, MediaEntity>();

    for (const row of rows) {
      map.set(MediaId.raw(row.id), {
        id: MediaId.raw(row.id),
        type: row.type as MediaEntity['type'],
        name: row.name,
        bucket: row.bucket,
        mimeType: row.mimeType,
        isTemporary: row.isTemporary,
        createdAt: row.createdAt,
        width: row.width,
        height: row.height,
        verifiedMimeType: row.verifiedMimeType,
      });
    }

    return map;
  }

  public async save(tx: Transaction, state: MediaEntity): Promise<void> {
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
        width: state.width,
        height: state.height,
        verifiedMimeType: state.verifiedMimeType,
      })
      .onConflictDoUpdate({
        target: media.id,
        set: {
          type: state.type,
          name: state.name,
          bucket: state.bucket,
          mimeType: state.mimeType,
          isTemporary: state.isTemporary,
          width: state.width,
          height: state.height,
          verifiedMimeType: state.verifiedMimeType,
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
