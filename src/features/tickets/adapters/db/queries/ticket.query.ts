import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import type {
  TicketDataView,
  TicketDetailView,
  TicketListItem,
} from '../../../application/ports.js';
import {
  MyTicketsQueryPort,
  TicketDetailQueryPort,
  TicketListQueryPort,
} from '../../../application/ports.js';
import type { TicketStatus } from '../../../domain/aggregates/ticket/state.js';
import type { TicketHistoryAction, TicketHistoryEntry } from '../../../domain/vo/history.js';
import type { TriggerId } from '../../../domain/vo/triggers.js';
import { TicketDatabaseClient } from '../client.js';
import type { TicketJsonState } from '../json-state.js';
import { tickets } from '../schema.js';
import { MediaService, type MediaLoader } from '@/kernel/application/ports/media.js';
import {
  BoardId,
  CategoryId,
  ItemId,
  MediaId,
  OrganizationId,
  TicketId,
  TypeId,
  UserId,
} from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleTicketQuery
  implements TicketListQueryPort, TicketDetailQueryPort, MyTicketsQueryPort
{
  public constructor(
    @Inject(TicketDatabaseClient) private readonly db: TicketDatabaseClient,
    @Inject(MediaService) private readonly mediaService: MediaService,
  ) {}

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

    const loader = this.mediaService.createMediaLoader({ visibility: 'PRIVATE' });
    const tickets_ = await Promise.all(
      rows.map((row) => this.toListItem(row.state as TicketJsonState, loader)),
    );

    return {
      tickets: tickets_,
      total: countResult[0]?.count ?? 0,
    };
  }

  public async findById(ticketId: TicketId): Promise<TicketDetailView | null> {
    const rows = await this.db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    const row = rows[0];
    if (!row) return null;

    const loader = this.mediaService.createMediaLoader({ visibility: 'PRIVATE' });
    return this.toDetailView(row.state as TicketJsonState, loader);
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

    const loader = this.mediaService.createMediaLoader({ visibility: 'PRIVATE' });
    const tickets_ = await Promise.all(
      rows.map((row) => this.toListItem(row.state as TicketJsonState, loader)),
    );

    return {
      tickets: tickets_,
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

  private async toListItem(s: TicketJsonState, loader: MediaLoader): Promise<TicketListItem> {
    return {
      ticketId: s.ticketId as TicketId,
      boardId: s.boardId as BoardId,
      message: s.message,
      triggerId: s.triggerId as TriggerId | null,
      status: s.status as TicketStatus,
      assigneeId: s.assigneeId as UserId | null,
      data: await this.toDataView(s.data ?? {}, loader),
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    };
  }

  private async toDetailView(s: TicketJsonState, loader: MediaLoader): Promise<TicketDetailView> {
    return {
      ticketId: s.ticketId as TicketId,
      boardId: s.boardId as BoardId,
      message: s.message,
      data: await this.toDataView(s.data ?? {}, loader),
      triggerId: s.triggerId as TriggerId | null,
      eventId: s.eventId ?? null,
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

  private async toDataView(
    data: TicketJsonState['data'],
    loader: MediaLoader,
  ): Promise<TicketDataView> {
    const [imageUrl, avatarUrl] = await Promise.all([
      data.item ? loader.getImageUrl(data.item.imageId ? MediaId.raw(data.item.imageId) : null) : Promise.resolve(null),
      data.organization
        ? loader.getImageUrl(data.organization.avatarId ? MediaId.raw(data.organization.avatarId) : null)
        : Promise.resolve(null),
    ]);

    return {
      ...(data.item && {
        item: {
          id: ItemId.raw(data.item.id),
          organizationId: OrganizationId.raw(data.item.organizationId),
          typeId: TypeId.raw(data.item.typeId),
          title: data.item.title,
          description: data.item.description,
          imageUrl,
          categoryIds: data.item.categoryIds.map((id) => CategoryId.raw(id)),
        },
      }),
      ...(data.organization && {
        organization: {
          id: OrganizationId.raw(data.organization.id),
          name: data.organization.name,
          description: data.organization.description,
          avatarUrl,
        },
      }),
    };
  }
}
