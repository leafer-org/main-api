import type { FileId } from '@/kernel/domain/ids.js';

export type UploadFileCommand = {
  type: 'UploadFile';
  id: FileId;
  name: string;
  bucket: string;
  mimeType: string;
  now: Date;
};

export type UseFileCommand = {
  type: 'UseFile';
  now: Date;
};

export type FreeFileCommand = {
  type: 'FreeFile';
};

export type FileCommand = UploadFileCommand | UseFileCommand | FreeFileCommand;
