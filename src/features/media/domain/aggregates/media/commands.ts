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

export type MediaCommand = UploadMediaCommand | UseMediaCommand | FreeMediaCommand;
