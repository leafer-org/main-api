import type { MediaId } from '@/kernel/domain/ids.js';

export type MediaType = 'image' | 'video';

export type MediaState = {
  id: MediaId;
  type: MediaType;
  name: string;
  bucket: string;
  mimeType: string;
  isTemporary: boolean;
  createdAt: Date;
};
