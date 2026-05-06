import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';

import { ChatRepository, SlotPoolResolver } from '../../application/ports.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import { CentrifugoTokenService } from '@/infra/centrifugo/centrifugo-token.service.js';
import { MainConfigService } from '@/infra/config/service.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import { ChatId, OrganizationId, UserId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

type SubscribeRequest = {
  client: string;
  user: string;
  channel: string;
};

type SubscribeResponse = { result: Record<string, never> } | { error: { code: number; message: string } };

const allow: SubscribeResponse = { result: {} };
const deny = (code: number, message: string): SubscribeResponse => ({
  error: { code, message },
});

@Controller()
export class CentrifugoController {
  public constructor(
    private readonly tokenService: CentrifugoTokenService,
    private readonly config: MainConfigService,
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
    @Inject(SlotPoolResolver) private readonly resolver: SlotPoolResolver,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  @Get('chats/centrifugo-token')
  public issueToken(@CurrentUser() user: JwtUserPayload): {
    token: string;
    expiresAt: string;
  } {
    const role = (user.role as string) === 'ADMIN' ? 'admin' : 'user';
    const { token, expiresAt } = this.tokenService.issue(user.userId, { role });
    return { token, expiresAt: expiresAt.toISOString() };
  }

  @Public()
  @Post('internal/centrifugo/subscribe')
  @HttpCode(200)
  public async subscribeProxy(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() body: SubscribeRequest,
  ): Promise<SubscribeResponse> {
    const expected = this.config.get('CENTRIFUGO_PROXY_SECRET');
    if (secret !== expected) {
      throw new UnauthorizedException('invalid_proxy_secret');
    }

    if (!body.user || !body.channel) {
      return deny(403, 'forbidden');
    }

    const userId = UserId.raw(body.user);
    const { channel } = body;

    if (channel.startsWith('chat:')) {
      const chatId = ChatId.raw(channel.slice('chat:'.length));
      return this.canWatchChat(chatId, userId);
    }
    if (channel.startsWith('inbox:user:')) {
      const channelUserId = channel.slice('inbox:user:'.length);
      return channelUserId === (userId as string) ? allow : deny(403, 'forbidden');
    }
    if (channel.startsWith('inbox:org:')) {
      const orgId = OrganizationId.raw(channel.slice('inbox:org:'.length));
      const can = await this.resolver.canAssign('organization', orgId as string, userId);
      return can ? allow : deny(403, 'forbidden');
    }
    if (channel === 'inbox:support') {
      const can = await this.permissionCheck.can(Permission.ChatRespondAsSupport);
      return can ? allow : deny(403, 'forbidden');
    }

    return deny(404, 'unknown_channel');
  }

  private async canWatchChat(chatId: ChatId, userId: UserId): Promise<SubscribeResponse> {
    const chat = await this.chatRepo.findById(NO_TRANSACTION, chatId);
    if (!chat) return deny(404, 'chat_not_found');

    // (а) user — assignee хотя бы одного participant'а
    const assigned = chat.participants.some(
      (p) => p.assignedUserId !== null && (p.assignedUserId as string) === (userId as string),
    );
    if (assigned) return allow;

    // (б) user входит в pool хотя бы одного operator-слота
    for (const p of chat.participants) {
      if (p.kind === 'user') continue;
      const can = await this.resolver.canAssign(p.kind, p.subjectId, userId);
      if (can) return allow;
    }

    return deny(403, 'forbidden');
  }
}
