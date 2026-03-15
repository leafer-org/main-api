import type { MediaId } from '../ids.js';

export type ImageMedia = { type: 'image'; mediaId: MediaId };
export type VideoMedia = { type: 'video'; mediaId: MediaId };
export type MediaItem = ImageMedia | VideoMedia;

export const MediaItem = {
  coverImageId(items: MediaItem[]): MediaId | null {
    const img = items.find((i): i is ImageMedia => i.type === 'image');
    return img?.mediaId ?? null;
  },
  allIds(items: MediaItem[]): MediaId[] {
    return items.map((i) => i.mediaId);
  },
};
