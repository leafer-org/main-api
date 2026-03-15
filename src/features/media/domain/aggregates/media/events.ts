import type { MediaId } from '@/kernel/domain/ids.js';
import type { MediaType } from './state.js';

export type MediaUploadedEvent = {
  type: 'media.uploaded';
  id: MediaId;
  mediaType: MediaType;
  name: string;
  bucket: string;
  mimeType: string;
  createdAt: Date;
};

export type MediaUsedEvent = {
  type: 'media.used';
  usedAt: Date;
};

export type MediaFreedEvent = {
  type: 'media.freed';
};

export type MediaEvent = MediaUploadedEvent | MediaUsedEvent | MediaFreedEvent;
