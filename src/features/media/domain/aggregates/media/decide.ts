import type { MediaCommand } from './commands.js';
import { MediaAlreadyExistsError, MediaAlreadyInUseError, MediaNotFoundError } from './errors.js';
import type { MediaEvent } from './events.js';
import type { MediaState } from './state.js';
import { assertNever } from '@/infra/ddd/utils.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export function mediaDecide(
  state: MediaState | null,
  command: MediaCommand,
): Either<MediaAlreadyExistsError | MediaNotFoundError | MediaAlreadyInUseError, MediaEvent> {
  switch (command.type) {
    case 'UploadMedia': {
      if (state) return Left(new MediaAlreadyExistsError());
      return Right({
        type: 'media.uploaded',
        id: command.id,
        mediaType: command.mediaType,
        name: command.name,
        bucket: command.bucket,
        mimeType: command.mimeType,
        createdAt: command.now,
      });
    }

    case 'UseMedia': {
      if (!state) return Left(new MediaNotFoundError());
      if (!state.isTemporary) return Left(new MediaAlreadyInUseError());
      return Right({
        type: 'media.used',
        usedAt: command.now,
      });
    }

    case 'FreeMedia': {
      if (!state) return Left(new MediaNotFoundError());
      return Right({
        type: 'media.freed',
      });
    }

    default:
      assertNever(command);
  }
}
