import type { MediaId } from '@/kernel/domain/ids.js';
import type { MediaType } from './state.js';

export type UploadMediaCommand = {
  type: 'UploadMedia';
  id: MediaId;
  mediaType: MediaType;
  name: string;
  bucket: string;
  mimeType: string;
  now: Date;
};

export type UseMediaCommand = {
  type: 'UseMedia';
  now: Date;
};

export type FreeMediaCommand = {
  type: 'FreeMedia';
};

export type InitiateVideoProcessingCommand = {
  type: 'InitiateVideoProcessing';
  mediaId: MediaId;
};

export type CompleteVideoProcessingCommand = {
  type: 'CompleteVideoProcessing';
  mediaId: MediaId;
  thumbnailMediaId: MediaId;
  hlsManifestKey: string;
  duration: number;
};

export type FailVideoProcessingCommand = {
  type: 'FailVideoProcessing';
  mediaId: MediaId;
  reason: string;
};

export type MediaCommand =
  | UploadMediaCommand
  | UseMediaCommand
  | FreeMediaCommand
  | InitiateVideoProcessingCommand
  | CompleteVideoProcessingCommand
  | FailVideoProcessingCommand;
