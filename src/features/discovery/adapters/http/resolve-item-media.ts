import type { ImageProxyOptions, MediaLoader, ResolvedMediaItem } from '@/kernel/application/ports/media.js';
import type { MediaId } from '@/kernel/domain/ids.js';
import type { ItemListView } from '../../domain/read-models/item-list-view.read-model.js';

export type ResolvedItemListView = Omit<ItemListView, 'media' | 'owner'> & {
  media: ResolvedMediaItem[];
  owner: {
    organizationId: string;
    name: string;
    avatarId: MediaId | null;
    avatarUrl: string | null;
    /**
     * Кружочек свежести: у орг есть пост, не просмотренный текущим user'ом,
     * не старше 7 дней. Для анонима и не-feed-контекстов всегда false.
     * Реальный расчёт делает feed.controller через OrganizationFreshnessQueryPort
     * и передаёт `freshOrgIds`. См. posts-views.spec.
     */
    hasUnreadFreshPosts: boolean;
  } | null;
};

export async function resolveItemListMedia(
  items: ItemListView[],
  loader: MediaLoader,
  avatarProxy: ImageProxyOptions,
  freshOrgIds: ReadonlySet<string> = new Set(),
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
        owner: item.owner
          ? {
              organizationId: item.owner.organizationId as string,
              name: item.owner.name,
              avatarId: item.owner.avatarId,
              avatarUrl,
              hasUnreadFreshPosts: freshOrgIds.has(item.owner.organizationId as string),
            }
          : null,
      };
    }),
  );
}
