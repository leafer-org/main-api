import { describe, expect, it } from 'vitest';

import { fileDecide } from './decide.js';
import type { FileState } from './state.js';
import { isLeft, Right } from '@/infra/lib/box.js';
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

const makePermanentFile = (): FileState => ({
  ...makeTemporaryFile(),
  isTemporary: false,
});

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('fileDecide', () => {
  describe('UploadFile', () => {
    it('возвращает file.uploaded если state = null', () => {
      const result = fileDecide(null, {
        type: 'UploadFile',
        id: FILE_ID,
        name: 'photo.jpg',
        bucket: 'public',
        mimeType: 'image/jpeg',
        now: NOW,
      });

      expect(result).toEqual(
        Right({
          type: 'file.uploaded',
          id: FILE_ID,
          name: 'photo.jpg',
          bucket: 'public',
          mimeType: 'image/jpeg',
          createdAt: NOW,
        }),
      );
    });

    it('возвращает FileAlreadyExistsError если файл уже существует', () => {
      const state = makeTemporaryFile();
      const result = fileDecide(state, {
        type: 'UploadFile',
        id: FILE_ID,
        name: 'photo.jpg',
        bucket: 'public',
        mimeType: 'image/jpeg',
        now: NOW,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('file_already_exists');
      }
    });
  });

  describe('UseFile', () => {
    it('возвращает file.used для temporary файла', () => {
      const state = makeTemporaryFile();
      const result = fileDecide(state, {
        type: 'UseFile',
        now: LATER,
      });

      expect(result).toEqual(
        Right({
          type: 'file.used',
          usedAt: LATER,
        }),
      );
    });

    it('возвращает FileNotFoundError если state = null', () => {
      const result = fileDecide(null, {
        type: 'UseFile',
        now: LATER,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('file_not_found');
      }
    });

    it('возвращает FileAlreadyInUseError если файл уже permanent', () => {
      const state = makePermanentFile();
      const result = fileDecide(state, {
        type: 'UseFile',
        now: LATER,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('file_already_in_use');
      }
    });
  });

  describe('FreeFile', () => {
    it('возвращает file.freed для существующего файла', () => {
      const state = makeTemporaryFile();
      const result = fileDecide(state, { type: 'FreeFile' });

      expect(result).toEqual(Right({ type: 'file.freed' }));
    });

    it('возвращает file.freed для permanent файла', () => {
      const state = makePermanentFile();
      const result = fileDecide(state, { type: 'FreeFile' });

      expect(result).toEqual(Right({ type: 'file.freed' }));
    });

    it('возвращает FileNotFoundError если state = null', () => {
      const result = fileDecide(null, { type: 'FreeFile' });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('file_not_found');
      }
    });
  });
});
