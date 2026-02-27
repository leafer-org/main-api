import { describe, expect, it } from 'vitest';

import { fileApply } from './apply.js';
import type { FileState } from './state.js';
import type { FileId } from '@/kernel/domain/ids.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const FILE_ID = 'file-1' as FileId;
const NOW = new Date('2024-06-01T12:00:00.000Z');
const LATER = new Date('2024-06-02T12:00:00.000Z');

const makeTemporaryFile = (): FileState => ({
  id: FILE_ID,
  name: 'photo.jpg',
  bucket: 'public',
  mimeType: 'image/jpeg',
  isTemporary: true,
  createdAt: NOW,
});

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('fileApply', () => {
  describe('file.uploaded', () => {
    it('создаёт FileState из null с isTemporary = true', () => {
      const result = fileApply(null, {
        type: 'file.uploaded',
        id: FILE_ID,
        name: 'photo.jpg',
        bucket: 'public',
        mimeType: 'image/jpeg',
        createdAt: NOW,
      });

      expect(result).toEqual({
        id: FILE_ID,
        name: 'photo.jpg',
        bucket: 'public',
        mimeType: 'image/jpeg',
        isTemporary: true,
        createdAt: NOW,
      });
    });
  });

  describe('file.used', () => {
    it('устанавливает isTemporary = false', () => {
      const state = makeTemporaryFile();
      const result = fileApply(state, {
        type: 'file.used',
        usedAt: LATER,
      });

      expect(result).toEqual({
        ...state,
        isTemporary: false,
      });
    });

    it('выбрасывает ошибку если state = null', () => {
      expect(() =>
        fileApply(null, {
          type: 'file.used',
          usedAt: LATER,
        }),
      ).toThrow('State is required');
    });
  });

  describe('file.freed', () => {
    it('возвращает null (агрегат удалён)', () => {
      const state = makeTemporaryFile();
      const result = fileApply(state, { type: 'file.freed' });

      expect(result).toBeNull();
    });
  });
});
