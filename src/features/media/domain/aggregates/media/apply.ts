import type { MediaEvent } from './events.js';
import type { MediaState } from './state.js';
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
      return {
        ...state,
        isTemporary: false,
      };
    }

    case 'media.freed': {
      return null;
    }

    default:
      assertNever(event);
  }
}
