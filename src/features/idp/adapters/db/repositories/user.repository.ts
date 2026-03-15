import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { UserRepository } from '../../../application/ports.js';
import type { UserState } from '../../../domain/aggregates/user/state.js';
import { PhoneNumber } from '../../../domain/vo/phone-number.js';
import { userStreamingContract } from '../../kafka/topics.js';
import { users } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { OutboxService } from '@/infra/lib/nest-outbox/outbox.service.js';
import { MediaService } from '@/kernel/application/ports/media.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { MediaId, UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo/role.js';

@Injectable()
export class DrizzleUserRepository extends UserRepository {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(MediaService) private readonly mediaService: MediaService,
  ) {
    super();
  }

  public async findById(tx: Transaction, userId: UserId): Promise<UserState | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return this.toDomain(row);
  }

  public async findByPhoneNumber(
    tx: Transaction,
    phoneNumber: PhoneNumber,
  ): Promise<{ id: UserId; role: Role; blockedAt: Date | undefined; blockReason: string | undefined } | null> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select({ id: users.id, role: users.role, blockedAt: users.blockedAt, blockReason: users.blockReason })
      .from(users)
      .where(eq(users.phoneNumber, phoneNumber as string))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return { id: UserId.raw(row.id), role: Role.raw(row.role), blockedAt: row.blockedAt ?? undefined, blockReason: row.blockReason ?? undefined };
  }

  public async findByRoleName(tx: Transaction, roleName: string): Promise<UserState[]> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(users).where(eq(users.role, roleName));
    return rows.map((row) => this.toDomain(row));
  }

  public async save(tx: Transaction, state: UserState): Promise<void> {
    const db = this.txHost.get(tx);

    // Read old avatar before upsert
    const oldRows = await db
      .select({ avatarFileId: users.avatarFileId })
      .from(users)
      .where(eq(users.id, state.id))
      .limit(1);
    const oldAvatarId = oldRows[0]?.avatarFileId ? MediaId.raw(oldRows[0].avatarFileId) : undefined;

    await db
      .insert(users)
      .values({
        id: state.id,
        phoneNumber: state.phoneNumber as string,
        fullName: state.fullName as string,
        avatarFileId: (state.avatarId as string) ?? null,
        role: state.role as string,
        cityId: state.cityId,
        lat: state.lat ?? null,
        lng: state.lng ?? null,
        blockedAt: state.blockedAt ?? null,
        blockReason: state.blockReason ?? null,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          phoneNumber: state.phoneNumber as string,
          fullName: state.fullName as string,
          avatarFileId: (state.avatarId as string) ?? null,
          role: state.role as string,
          cityId: state.cityId,
          lat: state.lat ?? null,
          lng: state.lng ?? null,
          blockedAt: state.blockedAt ?? null,
          blockReason: state.blockReason ?? null,
          updatedAt: state.updatedAt,
        },
      });

    // Media file lifecycle
    if (state.avatarId && state.avatarId !== oldAvatarId) {
      await this.mediaService.useFiles(tx, [state.avatarId]);
    }
    if (oldAvatarId && oldAvatarId !== state.avatarId) {
      await this.mediaService.freeFiles(tx, [oldAvatarId]);
    }

    await this.outbox.enqueue(
      db,
      userStreamingContract,
      {
        userId: state.id as string,
        phoneNumber: state.phoneNumber as string,
        fullName: state.fullName as string,
        role: state.role as string,
        cityId: state.cityId,
        lat: state.lat,
        lng: state.lng,
        blockedAt: state.blockedAt?.toISOString(),
        blockReason: state.blockReason,
        createdAt: state.createdAt.toISOString(),
        updatedAt: state.updatedAt.toISOString(),
      },
      { key: state.id as string },
    );
  }

  private toDomain(row: typeof users.$inferSelect): UserState {
    return {
      id: UserId.raw(row.id),
      phoneNumber: PhoneNumber.raw(row.phoneNumber),
      fullName: row.fullName as UserState['fullName'],
      avatarId: row.avatarFileId ? MediaId.raw(row.avatarFileId) : undefined,
      role: Role.raw(row.role),
      cityId: row.cityId,
      lat: row.lat ?? undefined,
      lng: row.lng ?? undefined,
      blockedAt: row.blockedAt ?? undefined,
      blockReason: row.blockReason ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
