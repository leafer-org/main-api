import { Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { TicketRepository } from '../../../application/ports.js';
import type { TicketState, TicketStatus } from '../../../domain/aggregates/ticket/state.js';
import type { TicketHistoryAction, TicketHistoryEntry } from '../../../domain/vo/history.js';
import type { TicketData } from '../../../domain/vo/ticket-data.js';
import type { TriggerId } from '../../../domain/vo/triggers.js';
import type { TicketJsonState } from '../json-state.js';
import { tickets } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { BoardId, TicketId, UserId } from '@/kernel/domain/ids.js';

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

  public async existsByEventId(tx: Transaction, eventId: string): Promise<boolean> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(sql`${tickets.state}->>'eventId' = ${eventId}`)
      .limit(1);
    return rows.length > 0;
  }

  public async findInProgressByAssignee(tx: Transaction, userId: UserId): Promise<TicketState[]> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.status, 'in-progress'),
          eq(tickets.assigneeId, userId as string),
        ),
      );
    return rows.map((row) => this.toDomain(row.state));
  }

  public async findOpenByTriggerAndEntityId(
    tx: Transaction,
    triggerId: TriggerId,
    entityId: string,
  ): Promise<TicketState[]> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.status, 'open'),
          sql`${tickets.state}->>'triggerId' = ${triggerId as string}`,
          sql`(
            ${tickets.state}->'data'->'item'->>'id' = ${entityId}
            OR ${tickets.state}->'data'->'organization'->>'id' = ${entityId}
          )`,
        ),
      );
    return rows.map((row) => this.toDomain(row.state));
  }

  public async findActiveByTriggerAndEntityId(
    tx: Transaction,
    triggerId: TriggerId,
    entityId: string,
  ): Promise<TicketState[]> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select()
      .from(tickets)
      .where(
        and(
          inArray(tickets.status, ['open', 'in-progress']),
          sql`${tickets.state}->>'triggerId' = ${triggerId as string}`,
          sql`(
            ${tickets.state}->'data'->'item'->>'id' = ${entityId}
            OR ${tickets.state}->'data'->'organization'->>'id' = ${entityId}
          )`,
        ),
      );
    return rows.map((row) => this.toDomain(row.state));
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
      eventId: raw.eventId ?? null,
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
