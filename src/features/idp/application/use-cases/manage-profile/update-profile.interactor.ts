import { Inject, Injectable } from '@nestjs/common';

import { UserEntity } from '../../../domain/aggregates/user/entity.js';
import { UserNotFoundError } from '../../../domain/aggregates/user/user.errors.js';
import { FullName } from '../../../domain/vo/full-name.js';
import { UserRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { FileId, type UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class UpdateProfileInteractor {
  public constructor(
    @Inject(Clock)
    private readonly clock: Clock,
    private readonly userRepository: UserRepository,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  public async execute(command: {
    userId: UserId;
    fullName: string;
    avatarId?: string;
    cityId?: string;
    lat?: number;
    lng?: number;
  }) {
    const fullNameEither = FullName.create(command.fullName);
    if (isLeft(fullNameEither)) return fullNameEither;

    const fullName = fullNameEither.value;
    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.userRepository.findById(tx, command.userId);
      if (!state) return Left(new UserNotFoundError());

      const result = UserEntity.updateProfile(state, {
        type: 'UpdateProfile',
        fullName,
        avatarId: command.avatarId ? FileId.raw(command.avatarId) : state.avatarId,
        cityId: command.cityId,
        lat: command.lat,
        lng: command.lng,
        now,
      });

      if (isLeft(result)) return result;

      await this.userRepository.save(tx, result.value.state);

      return Right(undefined);
    });
  }
}
