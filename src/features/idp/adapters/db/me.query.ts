import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { MeQueryPort } from '../../application/ports.js';
import type { MeReadModel } from '../../domain/read-models/me.read-model.js';
import type { FullName } from '../../domain/vo/full-name.js';
import { media, sessions, users } from '@/infra/db/schema/idp.schema.js';
import { DatabaseClient } from '@/infra/db/service.js';
import type { FileId, SessionId, UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo.js';

@Injectable()
export class DrizzleMeQuery extends MeQueryPort {
  public constructor(private readonly dbClient: DatabaseClient) {
    super();
  }

  public async findMe(userId: UserId, sessionId: SessionId): Promise<MeReadModel | null> {
    const rows = await this.dbClient.db
      .select({
        userId: users.id,
        role: users.role,
        sessionId: sessions.id,
        fullName: users.fullName,
        avatarId: media.userAvatarId,
      })
      .from(users)
      .innerJoin(sessions, and(eq(sessions.userId, users.id), eq(sessions.id, sessionId)))
      .leftJoin(media, eq(media.userAvatarId, users.id))
      .where(eq(users.id, userId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      userId: row.userId as UserId,
      role: row.role as Role,
      sessionId: row.sessionId as SessionId,
      fullName: row.fullName as FullName,
      avatarId: (row.avatarId as FileId) ?? undefined,
    };
  }
}
