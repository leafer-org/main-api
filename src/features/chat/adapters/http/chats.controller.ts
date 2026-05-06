import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  ChatDetailQueryPort,
  ChatListQueryPort,
  ChatMessagesQueryPort,
  type ChatSearchHit,
  UnreadSummaryQueryPort,
} from '../../application/ports.js';
import { DeleteMessageInteractor } from '../../application/use-cases/delete-message.interactor.js';
import { EditMessageInteractor } from '../../application/use-cases/edit-message.interactor.js';
import { MarkReadInteractor } from '../../application/use-cases/mark-read.interactor.js';
import { OpenChatWithOrganizationInteractor } from '../../application/use-cases/open-chat-with-organization.interactor.js';
import { OpenChatWithSupportInteractor } from '../../application/use-cases/open-chat-with-support.interactor.js';
import {
  ReportChatInteractor,
  ReportMessageInteractor,
} from '../../application/use-cases/report-message.interactor.js';
import { SearchChatsAsUserInteractor } from '../../application/use-cases/search-chats.interactor.js';
import { SendMessageAsUserInteractor } from '../../application/use-cases/send-message-as-user.interactor.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import type { PublicBody, PublicQuery, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import {
  ChatId,
  ChatMessageId,
  ItemId,
  type MediaId,
  OrganizationId,
} from '@/kernel/domain/ids.js';

type SerializedHit = {
  messageId: string;
  chatId: string;
  snippet: string;
  highlightedText: string;
  senderParticipantId: string | null;
  senderUserId: string | null;
  senderKind: 'user' | 'organization' | 'support' | null;
  createdAt: string;
};
type SerializedHitWithPreview = SerializedHit & {
  chatPreview: {
    partyOther: { kind: 'user' | 'organization' | 'support'; subjectId: string | null };
    contextItemId: string | null;
  } | null;
};

function serializeHit(r: ChatSearchHit): SerializedHit {
  return {
    messageId: r.messageId as string,
    chatId: r.chatId as string,
    snippet: r.snippet,
    highlightedText: r.highlightedText,
    senderParticipantId: r.senderParticipantId === null ? null : (r.senderParticipantId as string),
    senderUserId: r.senderUserId === null ? null : (r.senderUserId as string),
    senderKind: r.senderKind,
    createdAt: r.createdAt.toISOString(),
  };
}

function serializeHitWithPreview(
  r: ChatSearchHit & {
    chatPreview: {
      partyOther: { kind: 'user' | 'organization' | 'support'; subjectId: string | null };
      contextItemId: string | null;
    } | null;
  },
): SerializedHitWithPreview {
  return { ...serializeHit(r), chatPreview: r.chatPreview };
}

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

function serializeChat(chat: {
  chatId: { toString(): string };
  status: string;
  participants: ReadonlyArray<{
    id: { toString(): string };
    kind: string;
    subjectId: string | null;
    assignedUserId: { toString(): string } | null;
  }>;
  contextItemId: string | null;
  lastMessage: {
    messageId: { toString(): string };
    preview: string;
    senderParticipantId: { toString(): string } | null;
    createdAt: Date;
  } | null;
  myUnreadCount: number;
  updatedAt: Date;
}) {
  return {
    chatId: chat.chatId.toString(),
    status: chat.status,
    participants: chat.participants.map((p) => ({
      id: p.id.toString(),
      kind: p.kind,
      subjectId: p.subjectId,
      assignedUserId: p.assignedUserId === null ? null : p.assignedUserId.toString(),
    })),
    contextItemId: chat.contextItemId,
    lastMessage:
      chat.lastMessage === null
        ? null
        : {
            messageId: chat.lastMessage.messageId.toString(),
            preview: chat.lastMessage.preview,
            senderParticipantId:
              chat.lastMessage.senderParticipantId === null
                ? null
                : chat.lastMessage.senderParticipantId.toString(),
            createdAt: chat.lastMessage.createdAt.toISOString(),
          },
    myUnreadCount: chat.myUnreadCount,
    updatedAt: chat.updatedAt.toISOString(),
  };
}

@Controller('chats')
export class ChatsController {
  public constructor(
    private readonly openWithOrg: OpenChatWithOrganizationInteractor,
    private readonly openWithSupport: OpenChatWithSupportInteractor,
    private readonly sendAsUser: SendMessageAsUserInteractor,
    private readonly editMessage: EditMessageInteractor,
    private readonly deleteMessage: DeleteMessageInteractor,
    private readonly reportMessage: ReportMessageInteractor,
    private readonly reportChat: ReportChatInteractor,
    private readonly markRead: MarkReadInteractor,
    private readonly listQuery: ChatListQueryPort,
    private readonly detailQuery: ChatDetailQueryPort,
    private readonly messagesQuery: ChatMessagesQueryPort,
    private readonly unreadQuery: UnreadSummaryQueryPort,
    private readonly searchAsUser: SearchChatsAsUserInteractor,
  ) {}

  @Post()
  @HttpCode(200)
  public async openOrgChat(
    @Body() body: PublicBody['openChatWithOrganization'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['openChatWithOrganization']> {
    const result = await this.openWithOrg.execute({
      initiatorUserId: user.userId,
      organizationId: OrganizationId.raw(body.organizationId),
      contextItemId: body.contextItemId ? ItemId.raw(body.contextItemId) : null,
      message: { text: body.message.text, mediaIds: castMediaIds(body.message.mediaIds) },
    });
    if (isLeft(result)) throwDomainError(result.error);
    return {
      chatId: result.value.chatId,
      reused: result.value.reused,
      reopened: result.value.reopened,
    };
  }

  @Post('support')
  @HttpCode(200)
  public async openSupportChat(
    @Body() body: PublicBody['openChatWithSupport'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['openChatWithSupport']> {
    const result = await this.openWithSupport.execute({
      initiatorUserId: user.userId,
      message: { text: body.message.text, mediaIds: castMediaIds(body.message.mediaIds) },
    });
    if (isLeft(result)) throwDomainError(result.error);
    return {
      chatId: result.value.chatId,
      reused: result.value.reused,
      reopened: result.value.reopened,
    };
  }

  @Get()
  public async list(
    @CurrentUser() user: JwtUserPayload,
    @Query('from') from?: string,
    @Query('size') size?: string,
  ) {
    const page = await this.listQuery.findClientChats(user.userId, {
      from: from ? Number(from) : undefined,
      size: size ? Number(size) : undefined,
    });
    return {
      chats: page.chats.map(serializeChat),
      total: page.total,
    };
  }

  @Get('unread-summary')
  public async unreadSummary(@CurrentUser() user: JwtUserPayload) {
    const result = await this.unreadQuery.findUnread(user.userId);
    return {
      totalUnreadCount: result.totalUnreadCount,
      perChat: result.perChat.map((c) => ({ chatId: c.chatId, count: c.count })),
    };
  }

  @Get('search')
  public async search(
    @CurrentUser() user: JwtUserPayload,
    @Query() query: PublicQuery['searchInMyChats'],
  ): Promise<PublicResponse['searchInMyChats']> {
    const result = await this.searchAsUser.execute({
      userId: user.userId,
      q: query?.q ?? '',
      cursor: query?.cursor,
      limit: query?.limit ? Number(query.limit) : undefined,
    });
    if (isLeft(result)) throwDomainError(result.error);
    type GlobalHit = ChatSearchHit & {
      chatPreview?: {
        partyOther: { kind: 'user' | 'organization' | 'support'; subjectId: string | null };
        contextItemId: string | null;
      } | null;
    };
    const value = result.value as { results: GlobalHit[]; nextCursor: string | null };
    return {
      results: value.results.map((r) =>
        serializeHitWithPreview({ ...r, chatPreview: r.chatPreview ?? null }),
      ),
      nextCursor: value.nextCursor,
    };
  }

  @Get(':chatId/search')
  public async searchInChat(
    @Param('chatId') chatId: string,
    @CurrentUser() user: JwtUserPayload,
    @Query() query: PublicQuery['searchInChat'],
  ): Promise<PublicResponse['searchInChat']> {
    const result = await this.searchAsUser.execute({
      userId: user.userId,
      chatId: ChatId.raw(chatId),
      q: query?.q ?? '',
      cursor: query?.cursor,
      limit: query?.limit ? Number(query.limit) : undefined,
    });
    if (isLeft(result)) throwDomainError(result.error);
    return {
      results: result.value.results.map(serializeHit),
      nextCursor: result.value.nextCursor,
    };
  }

  @Get(':chatId')
  public async detail(
    @Param('chatId') chatId: string,
    @CurrentUser() user: JwtUserPayload,
  ) {
    const chat = await this.detailQuery.findById(ChatId.raw(chatId), user.userId);
    if (chat === null) {
      throw new HttpException(
        { statusCode: 404, message: 'chat_not_found', isDomain: true, type: 'chat_not_found', data: {} },
        404,
      );
    }
    return serializeChat(chat);
  }

  @Get(':chatId/messages')
  public async getMessages(
    @Param('chatId') chatId: string,
    @CurrentUser() user: JwtUserPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.messagesQuery.findMessages(ChatId.raw(chatId), user.userId, {
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
    return {
      messages: result.messages.map((m) => ({
        messageId: m.messageId,
        chatId: m.chatId,
        senderParticipantId: m.senderParticipantId,
        kind: m.kind,
        text: m.text,
        mediaIds: m.mediaIds,
        systemEvent: m.systemEvent,
        createdAt: m.createdAt.toISOString(),
        editedAt: m.editedAt?.toISOString() ?? null,
        deletedAt: m.deletedAt?.toISOString() ?? null,
      })),
      nextCursor: result.nextCursor,
    };
  }

  @Post(':chatId/messages')
  @HttpCode(200)
  public async sendMessage(
    @Param('chatId') chatId: string,
    @Body() body: PublicBody['sendMessageInChat'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['sendMessageInChat']> {
    const result = await this.sendAsUser.execute({
      chatId: ChatId.raw(chatId),
      actorUserId: user.userId,
      text: body.text,
      mediaIds: castMediaIds(body.mediaIds),
    });
    if (isLeft(result)) throwDomainError(result.error);
    return { messageId: result.value.messageId, reopened: result.value.reopened };
  }

  @Patch(':chatId/messages/:messageId')
  @HttpCode(204)
  public async edit(
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string,
    @Body() body: PublicBody['editMessageInChat'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.editMessage.execute({
      chatId: ChatId.raw(chatId),
      messageId: ChatMessageId.raw(messageId),
      actorUserId: user.userId,
      text: body.text,
      mediaIds: castMediaIds(body.mediaIds),
    });
    if (isLeft(result)) throwDomainError(result.error);
  }

  @Delete(':chatId/messages/:messageId')
  @HttpCode(204)
  public async remove(
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.deleteMessage.execute({
      chatId: ChatId.raw(chatId),
      messageId: ChatMessageId.raw(messageId),
      actorUserId: user.userId,
    });
    if (isLeft(result)) throwDomainError(result.error);
  }

  @Post(':chatId/messages/:messageId/report')
  @HttpCode(204)
  public async reportMsg(
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string,
    @Body() body: PublicBody['reportMessage'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.reportMessage.execute({
      chatId: ChatId.raw(chatId),
      messageId: ChatMessageId.raw(messageId),
      reporterUserId: user.userId,
      reason: body.reason,
      category: (body.category ?? null) as ReturnType<typeof reportCat>,
    });
    if (isLeft(result)) throwDomainError(result.error);
  }

  @Post(':chatId/report')
  @HttpCode(204)
  public async reportFullChat(
    @Param('chatId') chatId: string,
    @Body() body: PublicBody['reportChat'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.reportChat.execute({
      chatId: ChatId.raw(chatId),
      reporterUserId: user.userId,
      reason: body.reason,
      category: (body.category ?? null) as ReturnType<typeof reportCat>,
    });
    if (isLeft(result)) throwDomainError(result.error);
  }

  @Post(':chatId/read')
  @HttpCode(204)
  public async read(
    @Param('chatId') chatId: string,
    @Body() body: PublicBody['markChatRead'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.markRead.execute({
      chatId: ChatId.raw(chatId),
      actorUserId: user.userId,
      upToMessageId: ChatMessageId.raw(body.upToMessageId),
    });
    if (isLeft(result)) throwDomainError(result.error);
  }
}

function reportCat(c: 'spam' | 'abuse' | 'illegal' | 'other' | null) {
  return c;
}
