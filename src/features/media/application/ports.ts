import type { MediaState } from '../domain/aggregates/media/state.js';
import type { VideoDetails } from '../domain/aggregates/media/video-details.js';
import type { ImageProxyOptions, MediaVisibility } from '@/kernel/application/ports/media.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { MediaId } from '@/kernel/domain/ids.js';

// --- Repository ports ---

export abstract class MediaRepository {
  public abstract findById(tx: Transaction, id: MediaId): Promise<MediaState | null>;
  public abstract findByIds(tx: Transaction, ids: MediaId[]): Promise<Map<MediaId, MediaState>>;
  public abstract save(tx: Transaction, state: MediaState): Promise<void>;
  public abstract deleteById(tx: Transaction, id: MediaId): Promise<void>;
  public abstract deleteByIds(tx: Transaction, ids: MediaId[]): Promise<void>;
}

export abstract class VideoDetailsRepository {
  public abstract findByMediaId(tx: Transaction, mediaId: MediaId): Promise<VideoDetails | null>;
  public abstract save(tx: Transaction, details: VideoDetails): Promise<void>;
}

// --- Service ports ---

export type PresignedPost = {
  url: string;
  fields: Record<string, string>;
};

export abstract class FileStorageService {
  public abstract generateUploadPost(
    bucket: string,
    key: string,
    mimeType: string,
    maxFileSize: number,
  ): Promise<PresignedPost>;
  public abstract generateDownloadUrl(
    bucket: string,
    key: string,
    expiresIn?: number,
  ): Promise<string>;
  public abstract moveToPermanent(
    tempBucket: string,
    permanentBucket: string,
    key: string,
  ): Promise<void>;
  public abstract delete(bucket: string, key: string): Promise<void>;
  public abstract createMultipartUpload(
    bucket: string,
    key: string,
    mimeType: string,
  ): Promise<{ uploadId: string }>;
  public abstract getPresignedPartUrls(
    bucket: string,
    key: string,
    uploadId: string,
    partCount: number,
  ): Promise<string[]>;
  public abstract completeMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void>;
  public abstract downloadToFile(bucket: string, key: string, localPath: string): Promise<void>;
  public abstract uploadFile(
    bucket: string,
    key: string,
    localPath: string,
    contentType?: string,
  ): Promise<void>;
  public abstract uploadDirectory(bucket: string, prefix: string, localDir: string): Promise<void>;
}

export abstract class ImageProxyUrlSigner {
  public abstract sign(url: string): string;
}

// --- Queue port ---

export abstract class VideoProcessingQueue {
  public abstract enqueue(mediaId: MediaId, bucket: string): Promise<void>;
}

// --- Transcoder port ---

export type TranscodeInput = { localPath: string; outputDir: string };
export type TranscodeOutput = {
  hlsManifestPath: string;
  thumbnailPath: string;
  duration: number;
  variants: { resolution: string; bitrate: number }[];
};

export abstract class VideoTranscoder {
  public abstract transcode(input: TranscodeInput): Promise<TranscodeOutput>;
}

// --- Config port ---

export abstract class MediaConfig {
  public abstract readonly publicBucket: string;
  public abstract readonly maxFileSize: number;
  public abstract readonly maxVideoFileSize: number;
}

// --- ID generation ---

export abstract class MediaIdGenerator {
  public abstract generateMediaId(): MediaId;
}

// Re-export for convenience
export type { MediaVisibility, ImageProxyOptions };
