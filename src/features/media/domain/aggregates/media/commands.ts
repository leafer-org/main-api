import type { MediaId } from '@/kernel/domain/ids.js';
import type { MediaType } from './entity.js';

export type UploadMediaCommand = {
  id: MediaId;
  mediaType: MediaType;
  name: string;
  bucket: string;
  mimeType: string;
  now: Date;
};

export type UseMediaCommand = {
  now: Date;
};

export type CompleteImageUploadCommand = {
  width: number;
  height: number;
  verifiedMimeType: string;
};

export type CompleteVideoProcessingCommand = {
  thumbnailMediaId: MediaId;
  hlsManifestKey: string;
  mp4PreviewKey: string;
  duration: number;
  width: number;
  height: number;
};

export type FailVideoProcessingCommand = {
  reason: string;
};
