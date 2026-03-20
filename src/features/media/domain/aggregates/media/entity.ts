import type { EntityState } from '@/infra/ddd/entity-state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import type { MediaId } from '@/kernel/domain/ids.js';
import type {
  CompleteVideoProcessingCommand,
  FailVideoProcessingCommand,
  UploadMediaCommand,
  UseMediaCommand,
} from './commands.js';
import {
  MediaAlreadyExistsError,
  MediaAlreadyInUseError,
  MediaNotVideoError,
  VideoAlreadyProcessingError,
  VideoNotPendingError,
} from './errors.js';
import type {
  MediaFreedEvent,
  MediaUploadedEvent,
  MediaUsedEvent,
  VideoProcessingCompletedEvent,
  VideoProcessingFailedEvent,
  VideoProcessingInitiatedEvent,
} from './events.js';
import { VideoDetailsEntity } from './entities/video-details.entity.js';

export type MediaType = 'image' | 'video';

export type MediaEntity = EntityState<{
  id: MediaId;
  type: MediaType;
  name: string;
  bucket: string;
  mimeType: string;
  isTemporary: boolean;
  createdAt: Date;
}>;

export const MediaEntity = {
  upload(
    cmd: UploadMediaCommand,
  ): Either<MediaAlreadyExistsError, { state: MediaEntity; event: MediaUploadedEvent }> {
    const event: MediaUploadedEvent = {
      type: 'media.uploaded',
      id: cmd.id,
      mediaType: cmd.mediaType,
      name: cmd.name,
      bucket: cmd.bucket,
      mimeType: cmd.mimeType,
      createdAt: cmd.now,
    };

    const state: MediaEntity = {
      id: event.id,
      type: event.mediaType,
      name: event.name,
      bucket: event.bucket,
      mimeType: event.mimeType,
      isTemporary: true,
      createdAt: event.createdAt,
    };

    return Right({ state, event });
  },

  use(
    state: MediaEntity,
    cmd: UseMediaCommand,
  ): Either<MediaAlreadyInUseError, { state: MediaEntity; event: MediaUsedEvent }> {
    if (!state.isTemporary) return Left(new MediaAlreadyInUseError());

    const event: MediaUsedEvent = { type: 'media.used', usedAt: cmd.now };
    const newState: MediaEntity = { ...state, isTemporary: false };

    return Right({ state: newState, event });
  },

  free(state: MediaEntity): { state: null; event: MediaFreedEvent } {
    return { state: null, event: { type: 'media.freed' } };
  },

  initiateProcessing(
    state: MediaEntity,
    videoDetails: VideoDetailsEntity | null,
  ): Either<
    MediaNotVideoError | VideoAlreadyProcessingError,
    { videoDetails: VideoDetailsEntity; event: VideoProcessingInitiatedEvent }
  > {
    if (state.type !== 'video') return Left(new MediaNotVideoError());

    const result = VideoDetailsEntity.initiateProcessing(videoDetails);
    if ('error' in result) return result;

    const event: VideoProcessingInitiatedEvent = {
      type: 'video.processing-initiated',
      mediaId: state.id,
    };

    return Right({ videoDetails: result.value.state, event });
  },

  completeProcessing(
    state: MediaEntity,
    videoDetails: VideoDetailsEntity | null,
    cmd: CompleteVideoProcessingCommand,
  ): Either<
    MediaNotVideoError | VideoNotPendingError,
    { videoDetails: VideoDetailsEntity; event: VideoProcessingCompletedEvent }
  > {
    if (state.type !== 'video') return Left(new MediaNotVideoError());

    const result = VideoDetailsEntity.completeProcessing(videoDetails, cmd);
    if ('error' in result) return result;

    const event: VideoProcessingCompletedEvent = {
      type: 'video.processing-completed',
      mediaId: state.id,
      thumbnailMediaId: cmd.thumbnailMediaId,
      hlsManifestKey: cmd.hlsManifestKey,
      mp4PreviewKey: cmd.mp4PreviewKey,
      duration: cmd.duration,
    };

    return Right({ videoDetails: result.value.state, event });
  },

  failProcessing(
    state: MediaEntity,
    videoDetails: VideoDetailsEntity | null,
    cmd: FailVideoProcessingCommand,
  ): Either<
    MediaNotVideoError | VideoNotPendingError,
    { videoDetails: VideoDetailsEntity; event: VideoProcessingFailedEvent }
  > {
    if (state.type !== 'video') return Left(new MediaNotVideoError());

    const result = VideoDetailsEntity.failProcessing(videoDetails);
    if ('error' in result) return result;

    const event: VideoProcessingFailedEvent = {
      type: 'video.processing-failed',
      mediaId: state.id,
      reason: cmd.reason,
    };

    return Right({ videoDetails: result.value.state, event });
  },
};
