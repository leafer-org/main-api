import type { BoardScope, BoardState } from '../domain/aggregates/board/state.js';
import type { TicketState, TicketStatus } from '../domain/aggregates/ticket/state.js';
import type { TicketHistoryEntry } from '../domain/vo/history.js';
import type { TriggerId } from '../domain/vo/triggers.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type {
  BoardAutomationId,
  BoardCloseSubscriptionId,
  BoardId,
  BoardRedirectSubscriptionId,
  BoardSubscriptionId,
  CategoryId,
  ItemId,
  OrganizationId,
  TicketId,
  TypeId,
  UserId,
} from '@/kernel/domain/ids.js';

// --- Aggregate repository ports (write-side, transactional) ---

export abstract class TicketRepository {
  public abstract findById(tx: Transaction, ticketId: TicketId): Promise<TicketState | null>;
  public abstract save(tx: Transaction, state: TicketState): Promise<void>;
  public abstract deleteById(tx: Transaction, ticketId: TicketId): Promise<void>;
  public abstract existsByEventId(tx: Transaction, eventId: string): Promise<boolean>;
  public abstract findOpenByTriggerAndEntityId(
    tx: Transaction,
    triggerId: TriggerId,
    entityId: string,
  ): Promise<TicketState[]>;
  public abstract findActiveByTriggerAndEntityId(
    tx: Transaction,
    triggerId: TriggerId,
    entityId: string,
  ): Promise<TicketState[]>;
  public abstract findInProgressByAssignee(tx: Transaction, userId: UserId): Promise<TicketState[]>;
}

export abstract class BoardRepository {
  public abstract findById(tx: Transaction, boardId: BoardId): Promise<BoardState | null>;
  public abstract findByTrigger(tx: Transaction, triggerId: TriggerId): Promise<BoardState[]>;
  public abstract save(tx: Transaction, state: BoardState): Promise<void>;
  public abstract deleteById(tx: Transaction, boardId: BoardId): Promise<void>;
}

// --- Read-model query ports (read-side, no transactions) ---

// Read-side view: IDs из домена резолвятся в URL через MediaService на уровне query-адаптера.
export type TicketDataView = {
  item?: {
    id: ItemId;
    organizationId: OrganizationId;
    typeId: TypeId;
    title: string;
    description: string;
    imageUrl: string | null;
    categoryIds: CategoryId[];
  };
  organization?: {
    id: OrganizationId;
    name: string;
    description: string;
    avatarUrl: string | null;
  };
};

export type TicketListItem = {
  ticketId: TicketId;
  boardId: BoardId;
  message: string;
  triggerId: TriggerId | null;
  status: TicketStatus;
  assigneeId: UserId | null;
  data: TicketDataView;
  createdAt: Date;
  updatedAt: Date;
};

export type TicketDetailView = {
  ticketId: TicketId;
  boardId: BoardId;
  message: string;
  data: TicketDataView;
  triggerId: TriggerId | null;
  eventId: string | null;
  status: TicketStatus;
  assigneeId: UserId | null;
  history: TicketHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
};

export abstract class TicketListQueryPort {
  public abstract findTickets(params: {
    boardId?: BoardId;
    status?: TicketStatus;
    assigneeId?: UserId;
    from?: number;
    size?: number;
  }): Promise<{ tickets: TicketListItem[]; total: number }>;
}

export abstract class TicketDetailQueryPort {
  public abstract findById(ticketId: TicketId): Promise<TicketDetailView | null>;
}

export abstract class MyTicketsQueryPort {
  public abstract findByAssignee(
    userId: UserId,
    params?: { from?: number; size?: number },
  ): Promise<{ tickets: TicketListItem[]; total: number }>;
}

export type BoardListItem = {
  boardId: BoardId;
  name: string;
  description: string | null;
  scope: BoardScope;
  manualCreation: boolean;
  subscriptionCount: number;
  memberCount: number;
  automationCount: number;
  createdAt: Date;
};

export abstract class BoardListQueryPort {
  public abstract findBoards(params?: { scope?: BoardScope }): Promise<BoardListItem[]>;
}

export abstract class MyBoardsQueryPort {
  public abstract findByMember(userId: UserId): Promise<BoardListItem[]>;
}

export abstract class BoardDetailQueryPort {
  public abstract findById(boardId: BoardId): Promise<BoardState | null>;
}

// --- Service ports ---

export abstract class TicketIdGenerator {
  public abstract generateTicketId(): TicketId;
  public abstract generateBoardId(): BoardId;
  public abstract generateBoardSubscriptionId(): BoardSubscriptionId;
  public abstract generateBoardCloseSubscriptionId(): BoardCloseSubscriptionId;
  public abstract generateBoardRedirectSubscriptionId(): BoardRedirectSubscriptionId;
  public abstract generateBoardAutomationId(): BoardAutomationId;
}
