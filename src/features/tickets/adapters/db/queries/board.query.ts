import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { BoardListItem } from '../../../application/ports.js';
import { BoardDetailQueryPort, BoardListQueryPort } from '../../../application/ports.js';
import type { BoardScope, BoardState } from '../../../domain/aggregates/board/state.js';
import type { SubscriptionFilter } from '../../../domain/vo/filters.js';
import type { TriggerId } from '../../../domain/vo/triggers.js';
import { TicketDatabaseClient } from '../client.js';
import type { BoardJsonState } from '../json-state.js';
import { boards } from '../schema.js';
import type {
  BoardAutomationId,
  BoardId,
  BoardSubscriptionId,
  OrganizationId,
  UserId,
} from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleBoardQuery implements BoardListQueryPort, BoardDetailQueryPort {
  public constructor(@Inject(TicketDatabaseClient) private readonly db: TicketDatabaseClient) {}

  public async findBoards(params?: { scope?: BoardScope }): Promise<BoardListItem[]> {
    const query = this.db.select().from(boards);

    const rows = params?.scope ? await query.where(eq(boards.scope, params.scope)) : await query;

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

  public async findById(boardId: BoardId): Promise<BoardState | null> {
    const rows = await this.db.select().from(boards).where(eq(boards.id, boardId)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return this.toFullState(row.state as BoardJsonState);
  }

  private toFullState(s: BoardJsonState): BoardState {
    return {
      boardId: s.boardId as BoardId,
      name: s.name,
      description: s.description,
      scope: s.scope as BoardScope,
      organizationId: s.organizationId as OrganizationId | null,
      subscriptions: s.subscriptions.map((sub) => ({
        id: sub.id as BoardSubscriptionId,
        triggerId: sub.triggerId as TriggerId,
        filters: sub.filters as SubscriptionFilter[],
      })),
      manualCreation: s.manualCreation,
      allowedTransferBoardIds: s.allowedTransferBoardIds as BoardId[],
      memberIds: s.memberIds as UserId[],
      automations: s.automations.map((a) => ({
        id: a.id as BoardAutomationId,
        enabled: a.enabled,
        agentId: a.agentId,
        systemPrompt: a.systemPrompt,
        onUncertain: { moveToBoardId: a.onUncertain.moveToBoardId as BoardId | null },
      })),
      closeTrigger: s.closeTrigger
        ? { type: s.closeTrigger.type as 'on-moderation-resolved', addComment: s.closeTrigger.addComment }
        : null,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    };
  }
}
