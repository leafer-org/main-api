import type { ImageProxyOptions, MediaLoader, ResolvedMediaItem } from '@/kernel/application/ports/media.js';
import type { MediaId } from '@/kernel/domain/ids.js';
import type { ItemListView } from '../../domain/read-models/item-list-view.read-model.js';

export type ResolvedItemListView = Omit<ItemListView, 'media' | 'owner'> & {
  media: ResolvedMediaItem[];
  owner: { name: string; avatarId: MediaId | null; avatarUrl: string | null } | null;
};

export async function resolveItemListMedia(
  items: ItemListView[],
  loader: MediaLoader,
  avatarProxy: ImageProxyOptions,
): Promise<ResolvedItemListView[]> {
  return Promise.all(
    items.map(async (item): Promise<ResolvedItemListView> => {
      const [media, avatarUrl] = await Promise.all([
        Promise.all(item.media.map((m) => loader.resolve(m))),
        item.owner ? loader.getImageUrl(item.owner.avatarId, avatarProxy) : Promise.resolve(null),
      ]);

      return {
        ...item,
        media,
        owner: item.owner ? { ...item.owner, avatarUrl } : null,
      };
    }),
  );
}
