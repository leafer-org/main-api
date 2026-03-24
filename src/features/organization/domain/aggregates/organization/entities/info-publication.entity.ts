import type { InfoDraftEntity } from './info-draft.entity.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import type { MediaId } from '@/kernel/domain/ids.js';
import type { ContactLink } from '@/kernel/domain/vo/widget.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';

export type InfoPublicationEntity = EntityState<{
  name: string;
  description: string;
  avatarId: MediaId | null;
  media: MediaItem[];
  contacts: ContactLink[];
  publishedAt: Date;
}>;

export const InfoPublicationEntity = {
  createFromDraft(draft: InfoDraftEntity, publishedAt: Date): InfoPublicationEntity {
    return {
      name: draft.name,
      description: draft.description,
      avatarId: draft.avatarId,
      media: draft.media,
      contacts: draft.contacts,
      publishedAt,
    };
  },
};
