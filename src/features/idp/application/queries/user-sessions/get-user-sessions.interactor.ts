import { Injectable } from '@nestjs/common';

import { UserSessionsQueryPort } from '../../ports.js';
import { Right } from '@/infra/lib/box.js';
import type { UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetUserSessionsInteractor {
  public constructor(private readonly sessionsQuery: UserSessionsQueryPort) {}

  public async execute(command: { userId: UserId }) {
    const readModel = await this.sessionsQuery.findUserSessions(command.userId);

    return Right(readModel);
  }
}
