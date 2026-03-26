import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { BoardRepository } from '../../../application/ports.js';
import type { BoardAutomationEntity } from '../../../domain/aggregates/board/entities/board-automation.entity.js';
import type { BoardSubscriptionEntity } from '../../../domain/aggregates/board/entities/board-subscription.entity.js';
import type { BoardScope, BoardState, CloseTrigger } from '../../../domain/aggregates/board/state.js';
import type { SubscriptionFilter } from '../../../domain/vo/filters.js';
import type { TriggerId } from '../../../domain/vo/triggers.js';
import type { BoardJsonState } from '../json-state.js';
import { boards } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type {
  BoardAutomationId,
  BoardId,
  BoardSubscriptionId,
  OrganizationId,
  UserId,
} from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleBoardRepository extends BoardRepository {
  public constructor(private readonly txHost: TransactionHostPg) {
    super();
  }

  public async findById(tx: Transaction, boardId: BoardId): Promise<BoardState | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(boards).where(eq(boards.id, boardId)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return this.toDomain(row.state);
  }

  public async findByTrigger(tx: Transaction, triggerId: TriggerId): Promise<BoardState[]> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select()
      .from(boards)
      .where(
        sql`EXISTS (
          SELECT 1 FROM jsonb_array_elements(${boards.state}->'subscriptions') AS sub
          WHERE sub->>'triggerId' = ${triggerId as string}
        )`,
      );

    return rows.map((row) => this.toDomain(row.state));
  }

  public async save(tx: Transaction, state: BoardState): Promise<void> {
    const db = this.txHost.get(tx);

    await db
      .insert(boards)
      .values({
        id: state.boardId,
        scope: state.scope,
        state: this.toJson(state),
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      })
      .onConflictDoUpdate({
        target: boards.id,
        set: {
          scope: state.scope,
          state: this.toJson(state),
          updatedAt: state.updatedAt,
        },
      });
  }

  public async deleteById(tx: Transaction, boardId: BoardId): Promise<void> {
    const db = this.txHost.get(tx);
    await db.delete(boards).where(eq(boards.id, boardId));
  }

  private toJson(state: BoardState): unknown {
    return {
      ...state,
      createdAt: state.createdAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
    };
  }

  private toDomain(json: unknown): BoardState {
    const raw = json as BoardJsonState;

    return {
      boardId: raw.boardId as BoardId,
      name: raw.name,
      description: raw.description,
      scope: raw.scope as BoardScope,
      organizationId: raw.organizationId as OrganizationId | null,
      subscriptions: raw.subscriptions.map(
        (sub): BoardSubscriptionEntity => ({
          id: sub.id as BoardSubscriptionId,
          triggerId: sub.triggerId as TriggerId,
          filters: sub.filters as SubscriptionFilter[],
        }),
      ),
      manualCreation: raw.manualCreation,
      allowedTransferBoardIds: raw.allowedTransferBoardIds as BoardId[],
      memberIds: raw.memberIds as UserId[],
      automations: raw.automations.map(
        (auto): BoardAutomationEntity => ({
          id: auto.id as BoardAutomationId,
          enabled: auto.enabled,
          agentId: auto.agentId,
          systemPrompt: auto.systemPrompt,
          onUncertain: {
            moveToBoardId: auto.onUncertain.moveToBoardId as BoardId | null,
          },
        }),
      ),
      closeTrigger: raw.closeTrigger as CloseTrigger | null ?? null,
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
    };
  }
}
