import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import type { TicketListItem } from '../../../application/ports.js';
import {
  MyTicketsQueryPort,
  TicketDetailQueryPort,
  TicketListQueryPort,
} from '../../../application/ports.js';
import type { TicketState, TicketStatus } from '../../../domain/aggregates/ticket/state.js';
import type { TicketHistoryAction, TicketHistoryEntry } from '../../../domain/vo/history.js';
import type { TicketData } from '../../../domain/vo/ticket-data.js';
import type { TriggerId } from '../../../domain/vo/triggers.js';
import { TicketDatabaseClient } from '../client.js';
import type { TicketJsonState } from '../json-state.js';
import { tickets } from '../schema.js';
import type { BoardId, TicketId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleTicketQuery
  implements TicketListQueryPort, TicketDetailQueryPort, MyTicketsQueryPort
{
  public constructor(@Inject(TicketDatabaseClient) private readonly db: TicketDatabaseClient) {}

  public async findTickets(params: {
    boardId?: BoardId;
    status?: TicketStatus;
    assigneeId?: UserId;
    from?: number;
    size?: number;
  }): Promise<{ tickets: TicketListItem[]; total: number }> {
    const conditions = this.buildConditions(params);

    const [countResult, rows] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)::int` }).from(tickets).where(conditions),
      this.db
        .select()
        .from(tickets)
        .where(conditions)
        .orderBy(desc(tickets.createdAt))
        .offset(params.from ?? 0)
        .limit(params.size ?? 50),
    ]);

    return {
      tickets: rows.map((row) => this.toListItem(row.state as TicketJsonState)),
      total: countResult[0]?.count ?? 0,
    };
  }

  public async findById(ticketId: TicketId): Promise<TicketState | null> {
    const rows = await this.db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return this.toFullState(row.state as TicketJsonState);
  }

  public async findByAssignee(
    userId: UserId,
    params?: { from?: number; size?: number },
  ): Promise<{ tickets: TicketListItem[]; total: number }> {
    const condition = eq(tickets.assigneeId, userId as string);

    const [countResult, rows] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)::int` }).from(tickets).where(condition),
      this.db
        .select()
        .from(tickets)
        .where(condition)
        .orderBy(desc(tickets.createdAt))
        .offset(params?.from ?? 0)
        .limit(params?.size ?? 50),
    ]);

    return {
      tickets: rows.map((row) => this.toListItem(row.state as TicketJsonState)),
      total: countResult[0]?.count ?? 0,
    };
  }

  private buildConditions(params: {
    boardId?: BoardId;
    status?: TicketStatus;
    assigneeId?: UserId;
  }) {
    const conditions = [];

    if (params.boardId) {
      conditions.push(eq(tickets.boardId, params.boardId as string));
    }
    if (params.status) {
      conditions.push(eq(tickets.status, params.status));
    }
    if (params.assigneeId) {
      conditions.push(eq(tickets.assigneeId, params.assigneeId as string));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private toListItem(s: TicketJsonState): TicketListItem {
    return {
      ticketId: s.ticketId as TicketId,
      boardId: s.boardId as BoardId,
      message: s.message,
      triggerId: s.triggerId as TriggerId | null,
      status: s.status as TicketStatus,
      assigneeId: s.assigneeId as UserId | null,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    };
  }

  private toFullState(s: TicketJsonState): TicketState {
    return {
      ticketId: s.ticketId as TicketId,
      boardId: s.boardId as BoardId,
      message: s.message,
      data: s.data as TicketData,
      triggerId: s.triggerId as TriggerId | null,
      status: s.status as TicketStatus,
      assigneeId: s.assigneeId as UserId | null,
      history: s.history.map(
        (entry): TicketHistoryEntry => ({
          action: entry.action as TicketHistoryAction,
          actorId: entry.actorId as UserId,
          data: entry.data,
          timestamp: new Date(entry.timestamp),
        }),
      ),
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    };
  }
}
