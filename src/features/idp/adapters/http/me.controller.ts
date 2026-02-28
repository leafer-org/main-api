import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { GetMeInteractor } from '../../application/queries/me/get-me.interactor.js';
import { GetUserSessionsInteractor } from '../../application/queries/user-sessions/get-user-sessions.interactor.js';
import { UpdateProfileInteractor } from '../../application/use-cases/manage-profile/update-profile.interactor.js';
import { DeleteAllSessionsInteractor } from '../../application/use-cases/session/delete-all-sessions.interactor.js';
import { DeleteSessionInteractor } from '../../application/use-cases/session/delete-session.interactor.js';
import { resolveAvatarUrls } from './avatar-url.helper.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard, type JwtUserPayload } from './jwt-auth.guard.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { MediaService } from '@/kernel/application/ports/media.js';
import { SessionId } from '@/kernel/domain/ids.js';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  public constructor(
    private readonly getMeInteractor: GetMeInteractor,
    private readonly updateProfile: UpdateProfileInteractor,
    private readonly getUserSessions: GetUserSessionsInteractor,
    private readonly deleteAllSessions: DeleteAllSessionsInteractor,
    private readonly deleteSession: DeleteSessionInteractor,
    @Inject(MediaService)
    private readonly mediaService: MediaService,
  ) {}

  @Get()
  public async getMe(@CurrentUser() user: JwtUserPayload): Promise<PublicResponse['getMe']> {
    const result = await this.getMeInteractor.execute({
      userId: user.userId,
      sessionId: user.sessionId,
    });

    if (isLeft(result)) {
      throw new UnauthorizedException({ code: 'user_not_found' });
    }

    const me = result.value;
    const avatar = await resolveAvatarUrls(this.mediaService, me.avatarId);

    return {
      id: me.userId as string,
      phoneNumber: me.phoneNumber as string,
      fullName: (me.fullName as string) || undefined,
      avatar,
      createdAt: me.createdAt.toISOString(),
      updatedAt: me.updatedAt.toISOString(),
    };
  }

  @Patch('profile')
  public async updateProfileEndpoint(
    @Body() body: PublicBody['updateProfile'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['updateProfile']> {
    const result = await this.updateProfile.execute({
      userId: user.userId,
      fullName: body.fullName,
    });

    if (isLeft(result)) {
      throw new UnauthorizedException({ code: result.error.type });
    }

    // Re-fetch to return full User with avatar
    const meResult = await this.getMeInteractor.execute({
      userId: user.userId,
      sessionId: user.sessionId,
    });

    if (isLeft(meResult)) {
      throw new UnauthorizedException({ code: 'user_not_found' });
    }

    const me = meResult.value;
    const avatar = await resolveAvatarUrls(this.mediaService, me.avatarId);

    return {
      id: me.userId as string,
      phoneNumber: me.phoneNumber as string,
      fullName: (me.fullName as string) || undefined,
      avatar,
      createdAt: me.createdAt.toISOString(),
      updatedAt: me.updatedAt.toISOString(),
    };
  }

  @Get('sessions')
  public async getSessions(
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['getMeSessions']> {
    const result = await this.getUserSessions.execute({
      userId: user.userId,
    });

    if (isLeft(result)) {
      throw new UnauthorizedException({ code: 'unauthorized' });
    }

    return {
      sessions: result.value.sessions.map((s) => ({
        id: s.id as string,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
    };
  }

  @Delete('sessions')
  @HttpCode(204)
  public async deleteAllSessionsEndpoint(@CurrentUser() user: JwtUserPayload): Promise<void> {
    await this.deleteAllSessions.execute({
      userId: user.userId,
      currentSessionId: user.sessionId,
    });
  }

  @Delete('sessions/:sessionId')
  @HttpCode(204)
  public async deleteSessionEndpoint(
    @Param('sessionId') sessionId: string,
    @CurrentUser() _user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.deleteSession.execute({
      sessionId: SessionId.raw(sessionId),
    });

    if (isLeft(result)) {
      // Session not found or already deleted — still 204
    }
  }
}
