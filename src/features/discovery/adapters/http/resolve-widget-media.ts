import type {
  ImageProxyOptions,
  MediaLoader,
  ResolvedMediaItem,
} from '@/kernel/application/ports/media.js';
import type { ItemWidgetView } from '../../domain/read-models/item-detail-view.read-model.js';

type ResolvedBaseInfo = {
  type: 'base-info';
  title: string;
  description: string;
  media: ResolvedMediaItem[];
};

type ResolvedOwner = {
  type: 'owner';
  organizationId: string;
  name: string;
  avatarId: string | null;
  avatarUrl: string | null;
};

type ResolvedTeamMember = {
  name: string;
  description?: string;
  media: ResolvedMediaItem[];
  employeeUserId?: string;
};

type ResolvedTeam = {
  type: 'team';
  title: string;
  members: ResolvedTeamMember[];
};

/** Виджет после резолва медиа — base-info, owner и team заменены resolved-вариантами. */
export type ResolvedItemWidgetView =
  | ResolvedBaseInfo
  | ResolvedOwner
  | ResolvedTeam
  | Exclude<ItemWidgetView, { type: 'base-info' } | { type: 'owner' } | { type: 'team' }>;

export async function resolveWidgetMedia(
  widgets: ItemWidgetView[],
  loader: MediaLoader,
  avatarProxy: ImageProxyOptions,
): Promise<ResolvedItemWidgetView[]> {
  return Promise.all(
    widgets.map(async (w): Promise<ResolvedItemWidgetView> => {
      if (w.type === 'base-info') {
        const media = await Promise.all(w.media.map((m) => loader.resolve(m)));
        return { ...w, media };
      }
      if (w.type === 'team') {
        const members = await Promise.all(
          w.members.map(async (m) => ({
            ...m,
            media: await Promise.all(m.media.map((mi) => loader.resolve(mi))),
          })),
        );
        return { ...w, members };
      }
      if (w.type === 'owner') {
        const avatarUrl = await loader.getImageUrl(w.avatarId, avatarProxy);
        return { ...w, avatarId: w.avatarId ? String(w.avatarId) : null, avatarUrl };
      }
      return w;
    }),
  );
}
