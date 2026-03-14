import { Controller, Delete, Get, HttpCode, Param } from '@nestjs/common';

import { DeleteAdminSessionInteractor } from '../../application/use-cases/admin-sessions/delete-admin-session.interactor.js';
import { DeleteAllAdminSessionsInteractor } from '../../application/use-cases/admin-sessions/delete-all-admin-sessions.interactor.js';
import { GetAdminUserSessionsInteractor } from '../../application/use-cases/admin-sessions/get-admin-user-sessions.interactor.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { SessionId, UserId } from '@/kernel/domain/ids.js';

@Controller('admin/users/:userId/sessions')
export class AdminSessionsController {
  public constructor(
    private readonly getAdminUserSessions: GetAdminUserSessionsInteractor,
    private readonly deleteAdminSession: DeleteAdminSessionInteractor,
    private readonly deleteAllAdminSessions: DeleteAllAdminSessionsInteractor,
  ) {}

  @Get()
  public async getSessions(
    @Param('userId') userId: string,
  ): Promise<PublicResponse['getAdminUserSessions']> {
    const result = await this.getAdminUserSessions.execute({
      userId: UserId.raw(userId),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'getAdminUserSessions'>(result.error.toResponse());
    }

    return {
      sessions: result.value.sessions.map((s) => ({
        id: s.id as string,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
    };
  }

  @Delete(':sessionId')
  @HttpCode(204)
  public async deleteSession(
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    const result = await this.deleteAdminSession.execute({
      sessionId: SessionId.raw(sessionId),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'deleteAdminSession'>(result.error.toResponse());
    }
  }

  @Delete()
  @HttpCode(204)
  public async deleteAllSessions(
    @Param('userId') userId: string,
  ): Promise<void> {
    const result = await this.deleteAllAdminSessions.execute({
      userId: UserId.raw(userId),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'deleteAllAdminSessions'>(result.error.toResponse());
    }
  }
}
