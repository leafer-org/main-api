import { Inject, Injectable } from '@nestjs/common';

import { ChatNotFoundError } from '../../domain/aggregates/chat/errors.js';
import {
  ChatOrganizationMembershipReadModel,
  ChatRepository,
  ChatSearchQueryPort,
  type ChatSearchResultGlobal,
  type ChatSearchResultInChat,
  type OperatorSearchFilters,
} from '../ports.js';
import {
  InvalidCursorError,
  NoChatAccessError,
  QueryTooShortError,
} from '../errors.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import { type ChatId, type UserId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

const Q_MIN_LENGTH = 2;

function decodeCursor(raw: string | undefined): boolean {
  if (raw === undefined) return true;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      offset?: unknown;
    };
    return typeof parsed.offset === 'number' && parsed.offset >= 0;
  } catch {
    return false;
  }
}

type SearchUserInput = {
  userId: UserId;
  q: string;
  chatId?: ChatId;
  cursor?: string;
  limit?: number;
};

type SearchOperatorInput = SearchUserInput & {
  filters?: OperatorSearchFilters;
};

type SearchError = QueryTooShortError | InvalidCursorError | ChatNotFoundError | NoChatAccessError;

@Injectable()
export class SearchChatsAsUserInteractor {
  public constructor(
    @Inject(ChatSearchQueryPort) private readonly searchQuery: ChatSearchQueryPort,
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
  ) {}

  public async execute(
    input: SearchUserInput,
  ): Promise<Either<SearchError, ChatSearchResultGlobal | ChatSearchResultInChat>> {
    if (input.q.trim().length < Q_MIN_LENGTH) return Left(new QueryTooShortError());
    if (!decodeCursor(input.cursor)) return Left(new InvalidCursorError());

    if (input.chatId !== undefined) {
      // Visibility check: chat exists and user is participant.
      const chat = await this.chatRepo.findById(NO_TRANSACTION, input.chatId);
      if (!chat) return Left(new ChatNotFoundError());
      const visible = chat.participants.some(
        (p) =>
          (p.kind === 'user' && p.subjectId === (input.userId as string)) ||
          (p.assignedUserId !== null && (p.assignedUserId as string) === (input.userId as string)),
      );
      if (!visible) return Left(new ChatNotFoundError());
    }

    return Right(
      await this.searchQuery.searchForUser(input.userId, {
        q: input.q,
        chatId: input.chatId,
        cursor: input.cursor,
        limit: input.limit,
      }),
    );
  }
}

@Injectable()
export class SearchChatsAsOperatorInteractor {
  public constructor(
    @Inject(ChatSearchQueryPort) private readonly searchQuery: ChatSearchQueryPort,
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
    @Inject(ChatOrganizationMembershipReadModel)
    private readonly orgMembership: ChatOrganizationMembershipReadModel,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(
    input: SearchOperatorInput,
  ): Promise<Either<SearchError, ChatSearchResultGlobal | ChatSearchResultInChat>> {
    if (input.q.trim().length < Q_MIN_LENGTH) return Left(new QueryTooShortError());
    if (!decodeCursor(input.cursor)) return Left(new InvalidCursorError());

    const [memberOrgs, isSupport] = await Promise.all([
      this.orgMembership.findOrganizationsWhereUserCanRespond(input.userId),
      this.permissionCheck.can(Permission.ChatRespondAsSupport),
    ]);
    const memberOrgIds = memberOrgs.map((o) => o as string);

    if (!isSupport && memberOrgIds.length === 0) {
      return Left(new NoChatAccessError());
    }

    if (input.chatId !== undefined) {
      const chat = await this.chatRepo.findById(NO_TRANSACTION, input.chatId);
      if (!chat) return Left(new ChatNotFoundError());
      const visible = chat.participants.some((p) => {
        if (p.assignedUserId !== null && (p.assignedUserId as string) === (input.userId as string)) return true;
        if (p.kind === 'organization' && p.subjectId !== null && memberOrgIds.includes(p.subjectId)) return true;
        if (p.kind === 'support' && isSupport) return true;
        return false;
      });
      if (!visible) return Left(new ChatNotFoundError());
    }

    return Right(
      await this.searchQuery.searchForOperator(input.userId, isSupport, memberOrgIds, {
        q: input.q,
        chatId: input.chatId,
        filters: input.filters,
        cursor: input.cursor,
        limit: input.limit,
      }),
    );
  }
}
