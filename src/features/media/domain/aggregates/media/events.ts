import type { MediaId } from '@/kernel/domain/ids.js';
import type { MediaType } from './entity.js';

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

export type VideoProcessingInitiatedEvent = {
  type: 'video.processing-initiated';
  mediaId: MediaId;
};

export type VideoProcessingCompletedEvent = {
  type: 'video.processing-completed';
  mediaId: MediaId;
  thumbnailMediaId: MediaId;
  hlsManifestKey: string;
  mp4PreviewKey: string;
  duration: number;
};

export type VideoProcessingFailedEvent = {
  type: 'video.processing-failed';
  mediaId: MediaId;
  reason: string;
};

export type MediaEvent =
  | MediaUploadedEvent
  | MediaUsedEvent
  | MediaFreedEvent
  | VideoProcessingInitiatedEvent
  | VideoProcessingCompletedEvent
  | VideoProcessingFailedEvent;
