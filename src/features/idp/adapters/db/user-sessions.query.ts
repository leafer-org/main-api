import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { UserSessionsQueryPort } from '../../application/ports.js';
import type { UserSessionsReadModel } from '../../domain/read-models/user-sessions.read-model.js';
import { sessions } from '@/infra/db/schema/idp.schema.js';
import { DatabaseClient } from '@/infra/db/service.js';
import type { SessionId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleUserSessionsQuery extends UserSessionsQueryPort {
  public constructor(private readonly dbClient: DatabaseClient) {
    super();
  }

  public async findUserSessions(userId: UserId): Promise<UserSessionsReadModel> {
    const rows = await this.dbClient.db.select().from(sessions).where(eq(sessions.userId, userId));

    return {
      userId,
      sessions: rows.map((row) => ({
        id: row.id as SessionId,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      })),
    };
  }
}
