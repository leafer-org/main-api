import type { BlockUserCommand, CreateUserCommand, UnblockUserCommand, UpdateProfileCommand, UpdateUserRoleCommand } from './commands.js';
import type { UserBlockedEvent, UserCreatedEvent, UserProfileUpdatedEvent, UserRoleUpdatedEvent, UserUnblockedEvent } from './events.js';
import type { UserState } from './state.js';
import { UserAlreadyBlockedError, UserAlreadyExistsError, UserNotBlockedError, UserNotFoundError } from './user.errors.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export type { UserState } from './state.js';

export const UserEntity = {
  create(
    state: UserState | null,
    cmd: CreateUserCommand,
  ): Either<UserAlreadyExistsError, { state: UserState; event: UserCreatedEvent }> {
    if (state) return Left(new UserAlreadyExistsError());

    const event: UserCreatedEvent = {
      type: 'user.created',
      id: cmd.id,
      phoneNumber: cmd.phoneNumber,
      fullName: cmd.fullName,
      avatarId: cmd.avatarId,
      role: cmd.role,
      cityId: cmd.cityId,
      lat: cmd.lat,
      lng: cmd.lng,
      createdAt: cmd.now,
    };

    const newState: UserState = {
      id: cmd.id,
      phoneNumber: cmd.phoneNumber,
      fullName: cmd.fullName,
      avatarId: cmd.avatarId,
      role: cmd.role,
      cityId: cmd.cityId,
      lat: cmd.lat,
      lng: cmd.lng,
      blockedAt: undefined,
      blockReason: undefined,
      createdAt: cmd.now,
      updatedAt: cmd.now,
    };

    return Right({ state: newState, event });
  },

  updateProfile(
    state: UserState | null,
    cmd: UpdateProfileCommand,
  ): Either<UserNotFoundError, { state: UserState; event: UserProfileUpdatedEvent }> {
    if (!state) return Left(new UserNotFoundError());

    const event: UserProfileUpdatedEvent = {
      type: 'user.profile_updated',
      fullName: cmd.fullName,
      avatarId: cmd.avatarId,
      cityId: cmd.cityId,
      lat: cmd.lat,
      lng: cmd.lng,
      updatedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        fullName: cmd.fullName,
        avatarId: cmd.avatarId,
        ...(cmd.cityId !== undefined ? { cityId: cmd.cityId } : {}),
        ...(cmd.lat !== undefined ? { lat: cmd.lat } : {}),
        ...(cmd.lng !== undefined ? { lng: cmd.lng } : {}),
        updatedAt: cmd.now,
      },
      event,
    });
  },

  updateRole(
    state: UserState | null,
    cmd: UpdateUserRoleCommand,
  ): Either<UserNotFoundError, { state: UserState; event: UserRoleUpdatedEvent }> {
    if (!state) return Left(new UserNotFoundError());

    const event: UserRoleUpdatedEvent = {
      type: 'user.role_updated',
      userId: state.id,
      role: cmd.role,
      updatedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        role: cmd.role,
        updatedAt: cmd.now,
      },
      event,
    });
  },

  block(
    state: UserState | null,
    cmd: BlockUserCommand,
  ): Either<UserNotFoundError | UserAlreadyBlockedError, { state: UserState; event: UserBlockedEvent }> {
    if (!state) return Left(new UserNotFoundError());
    if (state.blockedAt) return Left(new UserAlreadyBlockedError());

    const event: UserBlockedEvent = {
      type: 'user.blocked',
      userId: state.id,
      reason: cmd.reason,
      blockedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        blockedAt: cmd.now,
        blockReason: cmd.reason,
        updatedAt: cmd.now,
      },
      event,
    });
  },

  unblock(
    state: UserState | null,
    cmd: UnblockUserCommand,
  ): Either<UserNotFoundError | UserNotBlockedError, { state: UserState; event: UserUnblockedEvent }> {
    if (!state) return Left(new UserNotFoundError());
    if (!state.blockedAt) return Left(new UserNotBlockedError());

    const event: UserUnblockedEvent = {
      type: 'user.unblocked',
      userId: state.id,
      unblockedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        blockedAt: undefined,
        blockReason: undefined,
        updatedAt: cmd.now,
      },
      event,
    });
  },
};
