import { Injectable } from '@nestjs/common';

import { UserNotFoundError } from '../../../domain/aggregates/user/user.errors.js';
import { MeQueryPort } from '../../ports.js';
import { Left, Right } from '@/infra/lib/box.js';
import type { SessionId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetMeInteractor {
  public constructor(private readonly meQuery: MeQueryPort) {}

  public async execute(command: { userId: UserId; sessionId: SessionId }) {
    const readModel = await this.meQuery.findMe(command.userId, command.sessionId);

    if (!readModel) return Left(new UserNotFoundError());

    return Right(readModel);
  }
}
