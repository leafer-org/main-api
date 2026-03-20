import type { InfoPublicationEntity } from './info-publication.entity.js';
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
  updatedAt: Date;
}>;

export const InfoDraftEntity = {
  create(
    name: string,
    description: string,
    avatarId: MediaId | null,
    media: MediaItem[],
    now: Date,
  ): InfoDraftEntity {
    return { name, description, avatarId, media, status: 'draft', updatedAt: now };
  },

  update(
    _state: InfoDraftEntity,
    name: string,
    description: string,
    avatarId: MediaId | null,
    media: MediaItem[],
    now: Date,
  ): InfoDraftEntity {
    return { name, description, avatarId, media, status: 'draft', updatedAt: now };
  },

  revertToPublication(publication: InfoPublicationEntity, now: Date): InfoDraftEntity {
    return {
      name: publication.name,
      description: publication.description,
      avatarId: publication.avatarId,
      media: publication.media,
      status: 'draft',
      updatedAt: now,
    };
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

  hasDraftChanges(state: InfoDraftEntity, publication: InfoPublicationEntity | null): boolean {
    if (!publication) return true;
    if (state.name !== publication.name) return true;
    if (state.description !== publication.description) return true;
    if (state.avatarId !== publication.avatarId) return true;
    if (state.media.length !== publication.media.length) return true;
    return state.media.some((m, i) => {
      const pub = publication.media[i]!;
      return m.type !== pub.type || m.mediaId !== pub.mediaId;
    });
  },

  canSubmitForModeration(state: InfoDraftEntity, publication: InfoPublicationEntity | null): boolean {
    const canSubmitByStatus = state.status === 'draft' || state.status === 'rejected';
    if (!canSubmitByStatus) return false;
    if (!publication) return true;
    return InfoDraftEntity.hasDraftChanges(state, publication);
  },
};
