import type { InfoDraftEntity } from './info-draft.entity.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import type { FileId } from '@/kernel/domain/ids.js';

export type InfoPublicationEntity = EntityState<{
  name: string;
  description: string;
  avatarId: FileId | null;
  publishedAt: Date;
}>;

export const InfoPublicationEntity = {
  createFromDraft(draft: InfoDraftEntity, publishedAt: Date): InfoPublicationEntity {
    return {
      name: draft.name,
      description: draft.description,
      avatarId: draft.avatarId,
      publishedAt,
    };
  },
};
