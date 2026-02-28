import { Inject, Injectable } from '@nestjs/common';

import { userApply } from '../../../domain/aggregates/user/apply.js';
import { userDecide } from '../../../domain/aggregates/user/decide.js';
import { UserNotFoundError } from '../../../domain/aggregates/user/user.errors.js';
import { FullName } from '../../../domain/vo/full-name.js';
import { UserRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class UpdateProfileInteractor {
  public constructor(
    @Inject(Clock)
    private readonly clock: Clock,
    private readonly userRepository: UserRepository,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  public async execute(command: { userId: UserId; fullName: string }) {
    const fullNameEither = FullName.create(command.fullName);
    if (isLeft(fullNameEither)) return fullNameEither;

    const fullName = fullNameEither.value;
    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.userRepository.findById(tx, command.userId);
      if (!state) return Left(new UserNotFoundError());

      const eventEither = userDecide(state, {
        type: 'UpdateProfile',
        fullName,
        now,
      });

      if (isLeft(eventEither)) return eventEither;

      const newState = userApply(state, eventEither.value);
      await this.userRepository.save(tx, newState);

      return Right(undefined);
    });
  }
}
