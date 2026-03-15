import type { MediaCommand } from './commands.js';
import {
  MediaAlreadyExistsError,
  MediaAlreadyInUseError,
  MediaNotFoundError,
  MediaNotVideoError,
  VideoAlreadyProcessingError,
  VideoNotPendingError,
} from './errors.js';
import type { MediaEvent } from './events.js';
import type { MediaState } from './state.js';
import type { VideoDetails } from './video-details.js';
import { assertNever } from '@/infra/ddd/utils.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

type DecideError =
  | MediaAlreadyExistsError
  | MediaNotFoundError
  | MediaAlreadyInUseError
  | MediaNotVideoError
  | VideoAlreadyProcessingError
  | VideoNotPendingError;

export function mediaDecide(
  state: MediaState | null,
  command: MediaCommand,
  videoDetails?: VideoDetails | null,
): Either<DecideError, MediaEvent> {
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
      return Right({ type: 'media.used', usedAt: command.now });
    }

    case 'FreeMedia': {
      if (!state) return Left(new MediaNotFoundError());
      return Right({ type: 'media.freed' });
    }

    case 'InitiateVideoProcessing':
    case 'CompleteVideoProcessing':
    case 'FailVideoProcessing':
      return decideVideoProcessing(state, command, videoDetails ?? null);

    default:
      assertNever(command);
  }
}

function decideVideoProcessing(
  state: MediaState | null,
  command:
    | MediaCommand & { type: 'InitiateVideoProcessing' }
    | MediaCommand & { type: 'CompleteVideoProcessing' }
    | MediaCommand & { type: 'FailVideoProcessing' },
  videoDetails: VideoDetails | null,
): Either<DecideError, MediaEvent> {
  if (!state) return Left(new MediaNotFoundError());
  if (state.type !== 'video') return Left(new MediaNotVideoError());

  switch (command.type) {
    case 'InitiateVideoProcessing': {
      if (videoDetails && videoDetails.processingStatus !== 'pending') {
        return Left(new VideoAlreadyProcessingError());
      }
      return Right({ type: 'video.processing-initiated', mediaId: command.mediaId });
    }

    case 'CompleteVideoProcessing': {
      if (!videoDetails || videoDetails.processingStatus !== 'processing') {
        return Left(new VideoNotPendingError());
      }
      return Right({
        type: 'video.processing-completed',
        mediaId: command.mediaId,
        thumbnailMediaId: command.thumbnailMediaId,
        hlsManifestKey: command.hlsManifestKey,
        duration: command.duration,
      });
    }

    case 'FailVideoProcessing': {
      if (!videoDetails || videoDetails.processingStatus !== 'processing') {
        return Left(new VideoNotPendingError());
      }
      return Right({
        type: 'video.processing-failed',
        mediaId: command.mediaId,
        reason: command.reason,
      });
    }

    default:
      assertNever(command)
  }
}
