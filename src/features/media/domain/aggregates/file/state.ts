import type { FileId } from '@/kernel/domain/ids.js';

export type FileState = {
  id: FileId;
  name: string;
  bucket: string;
  mimeType: string;
  isTemporary: boolean;
  createdAt: Date;
};
