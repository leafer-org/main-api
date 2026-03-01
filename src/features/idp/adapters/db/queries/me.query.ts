import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { MeQueryPort } from '../../../application/ports.js';
import type { MeReadModel } from '../../../domain/read-models/me.read-model.js';
import type { FullName } from '../../../domain/vo/full-name.js';
import type { PhoneNumber } from '../../../domain/vo/phone-number.js';
import { IdpDatabaseClient } from '../client.js';
import { sessions, users } from '../schema.js';
import { FileId, SessionId, UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo/role.js';

@Injectable()
export class DrizzleMeQuery extends MeQueryPort {
  public constructor(private readonly dbClient: IdpDatabaseClient) {
    super();
  }

  public async findMe(userId: UserId, sessionId: SessionId): Promise<MeReadModel | null> {
    const rows = await this.dbClient.db
      .select({
        userId: users.id,
        role: users.role,
        sessionId: sessions.id,
        fullName: users.fullName,
        phoneNumber: users.phoneNumber,
        avatarFileId: users.avatarFileId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .innerJoin(sessions, and(eq(sessions.userId, users.id), eq(sessions.id, sessionId)))
      .where(eq(users.id, userId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      userId: UserId.raw(row.userId),
      role: Role.raw(row.role),
      sessionId: SessionId.raw(row.sessionId),
      fullName: row.fullName as FullName,
      phoneNumber: row.phoneNumber as PhoneNumber,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      avatarId: row.avatarFileId ? FileId.raw(row.avatarFileId) : undefined,
    };
  }
}
