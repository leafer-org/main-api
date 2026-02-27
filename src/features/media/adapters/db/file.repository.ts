import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { FileRepository } from '../../application/ports.js';
import type { FileState } from '../../domain/aggregates/file/state.js';
import { files } from '@/infra/db/schema/media.schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { FileId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleFileRepository implements FileRepository {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async findById(tx: Transaction, id: FileId): Promise<FileState | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(files).where(eq(files.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id as FileId,
      name: row.name,
      bucket: row.bucket,
      mimeType: row.mimeType,
      isTemporary: row.isTemporary,
      createdAt: row.createdAt,
    };
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
}
