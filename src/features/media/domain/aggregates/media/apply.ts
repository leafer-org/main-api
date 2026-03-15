import type { MediaEvent } from './events.js';
import type { MediaState } from './state.js';
import type { VideoDetails } from './video-details.js';
import { assertNever } from '@/infra/ddd/utils.js';

export function mediaApply(state: MediaState | null, event: MediaEvent): MediaState | null {
  switch (event.type) {
    case 'media.uploaded':
      return {
        id: event.id,
        type: event.mediaType,
        name: event.name,
        bucket: event.bucket,
        mimeType: event.mimeType,
        isTemporary: true,
        createdAt: event.createdAt,
      };

    case 'media.used': {
      if (!state) throw new Error('State is required for media.used');
      return { ...state, isTemporary: false };
    }

    case 'media.freed':
      return null;

    case 'video.processing-initiated':
    case 'video.processing-completed':
    case 'video.processing-failed':
      return state;

    default:
      assertNever(event);
  }
}

export function videoDetailsApply(
  details: VideoDetails | null,
  event: MediaEvent,
): VideoDetails | null {
  switch (event.type) {
    case 'video.processing-initiated':
      return {
        mediaId: event.mediaId,
        processingStatus: 'processing',
        thumbnailMediaId: details?.thumbnailMediaId ?? null,
        hlsManifestKey: details?.hlsManifestKey ?? null,
        duration: details?.duration ?? null,
      };

    case 'video.processing-completed':
      return {
        mediaId: event.mediaId,
        processingStatus: 'ready',
        thumbnailMediaId: event.thumbnailMediaId,
        hlsManifestKey: event.hlsManifestKey,
        duration: event.duration,
      };

    case 'video.processing-failed':
      return {
        mediaId: event.mediaId,
        processingStatus: 'failed',
        thumbnailMediaId: details?.thumbnailMediaId ?? null,
        hlsManifestKey: details?.hlsManifestKey ?? null,
        duration: details?.duration ?? null,
      };

    default:
      return details;
  }
}
