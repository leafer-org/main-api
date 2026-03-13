import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { TicketState } from '../../../domain/aggregates/ticket/state.js';
import type { TicketStatus } from '../../../domain/aggregates/ticket/state.js';
import type { TicketHistoryEntry } from '../../../domain/vo/history.js';
import { TicketRepository } from '../../../application/ports.js';
import { tickets } from '../schema.js';
import type { TicketJsonState } from '../json-state.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { BoardId, TicketId, UserId } from '@/kernel/domain/ids.js';
import type { TriggerId } from '../../../domain/vo/triggers.js';
import type { TicketData } from '../../../domain/vo/ticket-data.js';
import type { TicketHistoryAction } from '../../../domain/vo/history.js';

@Injectable()
export class DrizzleTicketRepository extends TicketRepository {
  public constructor(private readonly txHost: TransactionHostPg) {
    super();
  }

  public async findById(tx: Transaction, ticketId: TicketId): Promise<TicketState | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return this.toDomain(row.state);
  }

  public async save(tx: Transaction, state: TicketState): Promise<void> {
    const db = this.txHost.get(tx);

    await db
      .insert(tickets)
      .values({
        id: state.ticketId,
        boardId: state.boardId as string,
        status: state.status,
        assigneeId: state.assigneeId as string | null,
        state: this.toJson(state),
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      })
      .onConflictDoUpdate({
        target: tickets.id,
        set: {
          boardId: state.boardId as string,
          status: state.status,
          assigneeId: state.assigneeId as string | null,
          state: this.toJson(state),
          updatedAt: state.updatedAt,
        },
      });
  }

  public async deleteById(tx: Transaction, ticketId: TicketId): Promise<void> {
    const db = this.txHost.get(tx);
    await db.delete(tickets).where(eq(tickets.id, ticketId));
  }

  private toJson(state: TicketState): unknown {
    return {
      ...state,
      createdAt: state.createdAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
      history: state.history.map((entry) => ({
        ...entry,
        timestamp: entry.timestamp.toISOString(),
      })),
    };
  }

  private toDomain(json: unknown): TicketState {
    const raw = json as TicketJsonState;

    return {
      ticketId: raw.ticketId as TicketId,
      boardId: raw.boardId as BoardId,
      message: raw.message,
      data: raw.data as TicketData,
      triggerId: raw.triggerId as TriggerId | null,
      status: raw.status as TicketStatus,
      assigneeId: raw.assigneeId as UserId | null,
      history: raw.history.map(
        (entry): TicketHistoryEntry => ({
          action: entry.action as TicketHistoryAction,
          actorId: entry.actorId as UserId,
          data: entry.data,
          timestamp: new Date(entry.timestamp),
        }),
      ),
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
    };
  }
}
