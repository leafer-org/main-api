import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { BoardScope } from '../../../domain/aggregates/board/state.js';
import { BoardListQueryPort } from '../../../application/ports.js';
import type { BoardListItem } from '../../../application/ports.js';
import { TicketDatabaseClient } from '../client.js';
import { boards } from '../schema.js';
import type { BoardJsonState } from '../json-state.js';
import type { BoardId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleBoardQuery implements BoardListQueryPort {
  public constructor(
    @Inject(TicketDatabaseClient) private readonly db: TicketDatabaseClient,
  ) {}

  public async findBoards(params?: { scope?: BoardScope }): Promise<BoardListItem[]> {
    const query = this.db.select().from(boards);

    const rows = params?.scope
      ? await query.where(eq(boards.scope, params.scope))
      : await query;

    return rows.map((row) => {
      const s = row.state as BoardJsonState;

      return {
        boardId: s.boardId as BoardId,
        name: s.name,
        description: s.description,
        scope: s.scope as BoardScope,
        manualCreation: s.manualCreation,
        subscriptionCount: s.subscriptions.length,
        memberCount: s.memberIds.length,
        automationCount: s.automations.length,
        createdAt: new Date(s.createdAt),
      };
    });
  }
}
