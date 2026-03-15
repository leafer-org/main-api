import type { MediaId } from '@/kernel/domain/ids.js';

export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type VideoDetails = {
  mediaId: MediaId;
  processingStatus: ProcessingStatus;
  thumbnailMediaId: MediaId | null;
  hlsManifestKey: string | null;
  duration: number | null;
};
