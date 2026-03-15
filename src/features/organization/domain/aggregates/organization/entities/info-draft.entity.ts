import { InfoNotInDraftError, InfoNotInModerationError } from '../errors.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import type { MediaId } from '@/kernel/domain/ids.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';

export type InfoDraftStatus = 'draft' | 'moderation-request' | 'rejected';

export type InfoDraftEntity = EntityState<{
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  status: InfoDraftStatus;
}>;

export const InfoDraftEntity = {
  create(name: string, description: string, avatarId: MediaId | null, media: MediaItem[]): InfoDraftEntity {
    return { name, description, avatarId, media, status: 'draft' };
  },

  update(
    _state: InfoDraftEntity,
    name: string,
    description: string,
    avatarId: MediaId | null,
    media: MediaItem[],
  ): InfoDraftEntity {
    return { name, description, avatarId, media, status: 'draft' };
  },

  submitForModeration(state: InfoDraftEntity): Either<InfoNotInDraftError, InfoDraftEntity> {
    if (state.status !== 'draft' && state.status !== 'rejected') {
      return Left(new InfoNotInDraftError());
    }
    return Right({ ...state, status: 'moderation-request' as const });
  },

  approve(state: InfoDraftEntity): Either<InfoNotInModerationError, InfoDraftEntity> {
    if (state.status !== 'moderation-request') {
      return Left(new InfoNotInModerationError());
    }
    return Right({ ...state, status: 'draft' as const });
  },

  reject(state: InfoDraftEntity): Either<InfoNotInModerationError, InfoDraftEntity> {
    if (state.status !== 'moderation-request') {
      return Left(new InfoNotInModerationError());
    }
    return Right({ ...state, status: 'rejected' as const });
  },

  canSubmit(state: InfoDraftEntity): boolean {
    return state.status === 'draft' || state.status === 'rejected';
  },
};
