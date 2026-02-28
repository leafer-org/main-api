import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { FileRepository } from '../../application/ports.js';
import type { FileState } from '../../domain/aggregates/file/state.js';
import { files } from './schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { FileId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleFileRepository implements FileRepository {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async findById(tx: Transaction, id: FileId): Promise<FileState | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(files).where(eq(files.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return {
      id: FileId.raw(row.id),
      name: row.name,
      bucket: row.bucket,
      mimeType: row.mimeType,
      isTemporary: row.isTemporary,
      createdAt: row.createdAt,
    };
  }

  public async findByIds(tx: Transaction, ids: FileId[]): Promise<Map<FileId, FileState>> {
    if (ids.length === 0) return new Map();

    const db = this.txHost.get(tx);
    const rows = await db.select().from(files).where(inArray(files.id, ids));
    const map = new Map<FileId, FileState>();

    for (const row of rows) {
      map.set(FileId.raw(row.id), {
        id: FileId.raw(row.id),
        name: row.name,
        bucket: row.bucket,
        mimeType: row.mimeType,
        isTemporary: row.isTemporary,
        createdAt: row.createdAt,
      });
    }

    return map;
  }

  public async save(tx: Transaction, state: FileState): Promise<void> {
    const db = this.txHost.get(tx);
    await db
      .insert(files)
      .values({
        id: state.id,
        name: state.name,
        bucket: state.bucket,
        mimeType: state.mimeType,
        isTemporary: state.isTemporary,
        createdAt: state.createdAt,
      })
      .onConflictDoUpdate({
        target: files.id,
        set: {
          name: state.name,
          bucket: state.bucket,
          mimeType: state.mimeType,
          isTemporary: state.isTemporary,
        },
      });
  }

  public async deleteById(tx: Transaction, id: FileId): Promise<void> {
    const db = this.txHost.get(tx);
    await db.delete(files).where(eq(files.id, id));
  }

  public async deleteByIds(tx: Transaction, ids: FileId[]): Promise<void> {
    if (ids.length === 0) return;

    const db = this.txHost.get(tx);
    await db.delete(files).where(inArray(files.id, ids));
  }
}
