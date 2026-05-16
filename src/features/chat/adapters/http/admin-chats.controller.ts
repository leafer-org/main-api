import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { type ChatSearchHit, ChatListQueryPort, type AdminChatFilters } from '../../application/ports.js';
import {
  BlockChatInteractor,
  UnblockChatInteractor,
} from '../../application/use-cases/block-chat.interactor.js';
import { ClaimSlotInteractor } from '../../application/use-cases/claim-slot.interactor.js';
import { OpenChatAsSupportInteractor } from '../../application/use-cases/open-chat-as-support.interactor.js';
import { ReassignSlotInteractor } from '../../application/use-cases/reassign-slot.interactor.js';
import { ReleaseSlotInteractor } from '../../application/use-cases/release-slot.interactor.js';
import { SearchChatsAsOperatorInteractor } from '../../application/use-cases/search-chats.interactor.js';
import { SendMessageAsOperatorInteractor } from '../../application/use-cases/send-message-as-operator.interactor.js';
import { serializeChat } from './serialize-chat.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft, Left } from '@/infra/lib/box.js';
import {
  ChatId,
  ChatParticipantId,
  type MediaId,
  OrganizationId,
  UserId,
} from '@/kernel/domain/ids.js';

function throwDomainError(error: { toResponse(): Record<number, unknown> }): never {
  const response = error.toResponse();
  const [statusCode] = Object.keys(response);
  throw new HttpException(
    response[Number(statusCode)] as Record<string, unknown>,
    Number(statusCode),
  );
}

function castMediaIds(ids: readonly string[]): readonly MediaId[] {
  return ids.map((m) => m as MediaId);
}

function serializeHit(
  r: ChatSearchHit & {
    chatPreview?: {
      partyOther: { kind: 'user' | 'organization' | 'support'; subjectId: string | null };
      contextItemId: string | null;
    } | null;
  },
) {
  return {
    messageId: r.messageId as string,
    chatId: r.chatId as string,
    snippet: r.snippet,
    highlightedText: r.highlightedText,
    senderParticipantId: r.senderParticipantId === null ? null : (r.senderParticipantId as string),
    senderUserId: r.senderUserId === null ? null : (r.senderUserId as string),
    senderKind: r.senderKind,
    createdAt: r.createdAt.toISOString(),
    ...(r.chatPreview !== undefined ? { chatPreview: r.chatPreview } : {}),
  };
}

@Controller('admin/chats')
export class AdminChatsController {
  public constructor(
    private readonly openAsSupport: OpenChatAsSupportInteractor,
    private readonly sendAsOperator: SendMessageAsOperatorInteractor,
    private readonly claimSlot: ClaimSlotInteractor,
    private readonly releaseSlot: ReleaseSlotInteractor,
    private readonly reassignSlot: ReassignSlotInteractor,
    private readonly blockChat: BlockChatInteractor,
    private readonly unblockChat: UnblockChatInteractor,
    private readonly listQuery: ChatListQueryPort,
    private readonly searchAsOperator: SearchChatsAsOperatorInteractor,
  ) {}

  @Post()
  @HttpCode(200)
  public async open(
    @Body() body: PublicBody['openChatAsSupport'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['openChatAsSupport']> {
    const target =
      body.target.kind === 'user'
        ? { kind: 'user' as const, userId: UserId.raw(body.target.userId) }
        : {
            kind: 'organization' as const,
            organizationId: OrganizationId.raw(body.target.organizationId),
          };

    const result = await this.openAsSupport.execute({
      actorUserId: user.userId,
      target,
      message: { text: body.message.text, mediaIds: castMediaIds(body.message.mediaIds) },
    });
    if (isLeft(result)) throwDomainError(result.error);
    return {
      chatId: result.value.chatId,
      reused: result.value.reused,
    };
  }

  @Get()
  public async list(
    @CurrentUser() user: JwtUserPayload,
    @Query('slotKind') slotKind?: 'organization' | 'support',
    @Query('orgId') orgId?: string,
    @Query('status') status?: 'open' | 'blocked',
    @Query('assignedToMe') assignedToMe?: string,
    @Query('unassigned') unassigned?: string,
    @Query('from') from?: string,
    @Query('size') size?: string,
  ) {
    const filters: AdminChatFilters = {
      slotKind,
      orgId,
      status,
      assignedToMe: assignedToMe === 'true',
      unassigned: unassigned === 'true',
    };
    const page = await this.listQuery.findOperatorChats(user.userId, filters, {
      from: from ? Number(from) : undefined,
      size: size ? Number(size) : undefined,
    });
    return {
      chats: page.chats.map(serializeChat),
      total: page.total,
    };
  }

  @Get('search')
  public async search(
    @CurrentUser() user: JwtUserPayload,
    @Query('q') q: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('slotKind') slotKind: 'organization' | 'support' | undefined,
    @Query('orgId') orgId: string | undefined,
    @Query('status') status: 'open' | 'blocked' | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
  ) {
    const result = await this.searchAsOperator.execute({
      userId: user.userId,
      q: q ?? '',
      cursor,
      limit: limit ? Number(limit) : undefined,
      filters: {
        slotKind,
        orgId,
        status,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      },
    });
    if (isLeft(result)) throwDomainError(result.error);
    return {
      results: result.value.results.map(serializeHit),
      nextCursor: result.value.nextCursor,
    };
  }

  @Get(':chatId/search')
  public async searchInChat(
    @Param('chatId') chatId: string,
    @CurrentUser() user: JwtUserPayload,
    @Query('q') q: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    const result = await this.searchAsOperator.execute({
      userId: user.userId,
      chatId: ChatId.raw(chatId),
      q: q ?? '',
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
    if (isLeft(result)) throwDomainError(result.error);
    return {
      results: result.value.results.map(serializeHit),
      nextCursor: result.value.nextCursor,
    };
  }

  @Post(':chatId/messages')
  @HttpCode(200)
  public async send(
    @Param('chatId') chatId: string,
    @Body() body: PublicBody['sendMessageAsOperator'],
    @Query('claim') claim: string | boolean | undefined,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['sendMessageAsOperator']> {
    const result = await this.sendAsOperator.execute({
      chatId: ChatId.raw(chatId),
      actorUserId: user.userId,
      text: body.text,
      mediaIds: castMediaIds(body.mediaIds),
      withClaim: claim === 'true' || claim === true,
    });
    if (isLeft(result)) throwDomainError(result.error);
    return {
      messageId: result.value.messageId,
      claimed: result.value.claimed,
    };
  }

  @Post(':chatId/participants/:participantId/claim')
  @HttpCode(204)
  public async claim(
    @Param('chatId') chatId: string,
    @Param('participantId') participantId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.claimSlot.execute({
      chatId: ChatId.raw(chatId),
      participantId: ChatParticipantId.raw(participantId),
      actorUserId: user.userId,
    });
    if (isLeft(result)) throwDomainError(result.error);
  }

  @Post(':chatId/participants/:participantId/release')
  @HttpCode(204)
  public async release(
    @Param('chatId') chatId: string,
    @Param('participantId') participantId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.releaseSlot.execute({
      chatId: ChatId.raw(chatId),
      participantId: ChatParticipantId.raw(participantId),
      actorUserId: user.userId,
    });
    if (isLeft(result)) throwDomainError(result.error);
  }

  @Post(':chatId/participants/:participantId/reassign')
  @HttpCode(204)
  public async reassign(
    @Param('chatId') chatId: string,
    @Param('participantId') participantId: string,
    @Body() body: PublicBody['reassignChatSlot'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.reassignSlot.execute({
      chatId: ChatId.raw(chatId),
      participantId: ChatParticipantId.raw(participantId),
      actorUserId: user.userId,
      newAssigneeUserId: UserId.raw(body.assignedUserId),
    });
    if (isLeft(result)) throwDomainError(result.error);
  }

  @Post(':chatId/block')
  @HttpCode(204)
  public async block(
    @Param('chatId') chatId: string,
    @Body() body: PublicBody['blockChat'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.blockChat.execute({
      chatId: ChatId.raw(chatId),
      actorUserId: user.userId,
      reason: body?.reason ?? null,
    });
    if (isLeft(result)) throwDomainError(result.error);
  }

  @Post(':chatId/unblock')
  @HttpCode(204)
  public async unblock(
    @Param('chatId') chatId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.unblockChat.execute({
      chatId: ChatId.raw(chatId),
      actorUserId: user.userId,
    });
    if (isLeft(result)) throwDomainError(result.error);
  }

}
