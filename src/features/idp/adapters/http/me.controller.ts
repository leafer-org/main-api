import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch } from '@nestjs/common';

import { UpdateProfileInteractor } from '../../application/use-cases/manage-profile/update-profile.interactor.js';
import { GetMeInteractor } from '../../application/use-cases/me/get-me.interactor.js';
import { GetMyPermissionsInteractor } from '../../application/use-cases/me/get-my-permissions.interactor.js';
import { DeleteAllSessionsInteractor } from '../../application/use-cases/session/delete-all-sessions.interactor.js';
import { DeleteSessionInteractor } from '../../application/use-cases/session/delete-session.interactor.js';
import { GetUserSessionsInteractor } from '../../application/use-cases/user-sessions/get-user-sessions.interactor.js';
import { resolveAvatarUrls } from './avatar-url.helper.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { MediaService } from '@/kernel/application/ports/media.js';
import { SessionId } from '@/kernel/domain/ids.js';

@Controller('me')
export class MeController {
  public constructor(
    private readonly getMeInteractor: GetMeInteractor,
    private readonly getMyPermissions: GetMyPermissionsInteractor,
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
      throw domainToHttpError<'getMe'>(result.error.toResponse());
    }

    const me = result.value;
    const avatar = await resolveAvatarUrls(this.mediaService, me.avatarId);

    return {
      id: me.userId as string,
      phoneNumber: me.phoneNumber as string,
      fullName: (me.fullName as string) || undefined,
      avatar,
      cityId: me.cityId,
      lat: me.lat,
      lng: me.lng,
      createdAt: me.createdAt.toISOString(),
      updatedAt: me.updatedAt.toISOString(),
    };
  }

  @Get('permissions')
  public async getPermissions(): Promise<PublicResponse['getMyPermissions']> {
    const result = await this.getMyPermissions.execute();
    return result.value;
  }

  @Patch('profile')
  public async updateProfileEndpoint(
    @Body() body: PublicBody['updateProfile'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['updateProfile']> {
    const result = await this.updateProfile.execute({
      userId: user.userId,
      fullName: body.fullName,
      avatarId: body.avatarId,
      cityId: body.cityId,
      lat: body.lat,
      lng: body.lng,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'updateProfile'>(result.error.toResponse());
    }

    // Re-fetch to return full User with avatar
    const meResult = await this.getMeInteractor.execute({
      userId: user.userId,
      sessionId: user.sessionId,
    });

    if (isLeft(meResult)) {
      throw domainToHttpError<'updateProfile'>(meResult.error.toResponse());
    }

    const me = meResult.value;
    const avatar = await resolveAvatarUrls(this.mediaService, me.avatarId);

    return {
      id: me.userId as string,
      phoneNumber: me.phoneNumber as string,
      fullName: (me.fullName as string) || undefined,
      avatar,
      cityId: me.cityId,
      lat: me.lat,
      lng: me.lng,
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

    return {
      sessions: result.value.sessions.map((s) => ({
        id: s.id as string,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        ip: s.ip ?? undefined,
        city: s.city ?? undefined,
        country: s.country ?? undefined,
        deviceName: s.deviceName ?? undefined,
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
