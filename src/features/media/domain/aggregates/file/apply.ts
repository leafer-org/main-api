import type { FileEvent } from './events.js';
import type { FileState } from './state.js';
import { assertNever } from '@/infra/ddd/utils.js';

export function fileApply(state: FileState | null, event: FileEvent): FileState | null {
  switch (event.type) {
    case 'file.uploaded':
      return {
        id: event.id,
        name: event.name,
        bucket: event.bucket,
        mimeType: event.mimeType,
        isTemporary: true,
        createdAt: event.createdAt,
      };

    case 'file.used': {
      if (!state) throw new Error('State is required for file.used');
      return {
        ...state,
        isTemporary: false,
      };
    }

    case 'file.freed': {
      return null;
    }

    default:
      assertNever(event);
  }
}
