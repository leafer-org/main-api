import type { FileId } from '@/kernel/domain/ids.js';

export type FileUploadedEvent = {
  type: 'file.uploaded';
  id: FileId;
  name: string;
  bucket: string;
  mimeType: string;
  createdAt: Date;
};

export type FileUsedEvent = {
  type: 'file.used';
  usedAt: Date;
};

export type FileFreedEvent = {
  type: 'file.freed';
};

export type FileEvent = FileUploadedEvent | FileUsedEvent | FileFreedEvent;
