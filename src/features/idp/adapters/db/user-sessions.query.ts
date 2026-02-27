import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { UserSessionsQueryPort } from '../../application/ports.js';
import type { UserSessionsReadModel } from '../../domain/read-models/user-sessions.read-model.js';
import { IdpDatabaseClient } from './client.js';
import { sessions } from './schema.js';
import type { SessionId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleUserSessionsQuery extends UserSessionsQueryPort {
  public constructor(private readonly dbClient: IdpDatabaseClient) {
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
