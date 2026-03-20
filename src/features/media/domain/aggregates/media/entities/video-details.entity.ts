import type { EntityState } from '@/infra/ddd/entity-state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import type { MediaId } from '@/kernel/domain/ids.js';
import { VideoAlreadyProcessingError, VideoNotPendingError } from '../errors.js';
import type { CompleteVideoProcessingCommand } from '../commands.js';

export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type VideoDetailsEntity = EntityState<{
  mediaId: MediaId;
  processingStatus: ProcessingStatus;
  thumbnailMediaId: MediaId | null;
  hlsManifestKey: string | null;
  mp4PreviewKey: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
}>;

export const VideoDetailsEntity = {
  create(mediaId: MediaId): VideoDetailsEntity {
    return {
      mediaId,
      processingStatus: 'pending',
      thumbnailMediaId: null,
      hlsManifestKey: null,
      mp4PreviewKey: null,
      duration: null,
      width: null,
      height: null,
    };
  },

  initiateProcessing(
    state: VideoDetailsEntity | null,
  ): Either<VideoAlreadyProcessingError, { state: VideoDetailsEntity }> {
    if (state && state.processingStatus !== 'pending') {
      return Left(new VideoAlreadyProcessingError());
    }
    return Right({
      state: {
        mediaId: state?.mediaId ?? ('' as MediaId),
        processingStatus: 'processing',
        thumbnailMediaId: state?.thumbnailMediaId ?? null,
        hlsManifestKey: state?.hlsManifestKey ?? null,
        mp4PreviewKey: state?.mp4PreviewKey ?? null,
        duration: state?.duration ?? null,
        width: state?.width ?? null,
        height: state?.height ?? null,
      },
    });
  },

  completeProcessing(
    state: VideoDetailsEntity | null,
    cmd: CompleteVideoProcessingCommand,
  ): Either<VideoNotPendingError, { state: VideoDetailsEntity }> {
    if (!state || state.processingStatus !== 'processing') {
      return Left(new VideoNotPendingError());
    }
    return Right({
      state: {
        mediaId: state.mediaId,
        processingStatus: 'ready',
        thumbnailMediaId: cmd.thumbnailMediaId,
        hlsManifestKey: cmd.hlsManifestKey,
        mp4PreviewKey: cmd.mp4PreviewKey,
        duration: cmd.duration,
        width: cmd.width,
        height: cmd.height,
      },
    });
  },

  failProcessing(
    state: VideoDetailsEntity | null,
  ): Either<VideoNotPendingError, { state: VideoDetailsEntity }> {
    if (!state || state.processingStatus !== 'processing') {
      return Left(new VideoNotPendingError());
    }
    return Right({
      state: {
        mediaId: state.mediaId,
        processingStatus: 'failed',
        thumbnailMediaId: state.thumbnailMediaId,
        hlsManifestKey: state.hlsManifestKey,
        mp4PreviewKey: state.mp4PreviewKey,
        duration: state.duration,
        width: state.width,
        height: state.height,
      },
    });
  },
};
