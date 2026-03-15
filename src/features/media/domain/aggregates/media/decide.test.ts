import { describe, expect, it } from 'vitest';

import { mediaDecide } from './decide.js';
import type { MediaState } from './state.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { MediaId } from '@/kernel/domain/ids.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const MEDIA_ID = MediaId.raw('file-1');
const NOW = new Date('2024-06-01T12:00:00.000Z');
const LATER = new Date('2024-06-02T12:00:00.000Z');

const makeTemporaryMedia = (): MediaState => ({
  id: MEDIA_ID,
  type: 'image',
  name: 'photo.jpg',
  bucket: 'public',
  mimeType: 'image/jpeg',
  isTemporary: true,
  createdAt: NOW,
});

const makePermanentMedia = (): MediaState => ({
  ...makeTemporaryMedia(),
  isTemporary: false,
});

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('mediaDecide', () => {
  describe('UploadMedia', () => {
    it('возвращает media.uploaded если state = null', () => {
      const result = mediaDecide(null, {
        type: 'UploadMedia',
        id: MEDIA_ID,
        mediaType: 'image',
        name: 'photo.jpg',
        bucket: 'public',
        mimeType: 'image/jpeg',
        now: NOW,
      });

      expect(result).toEqual(
        Right({
          type: 'media.uploaded',
          id: MEDIA_ID,
          mediaType: 'image',
          name: 'photo.jpg',
          bucket: 'public',
          mimeType: 'image/jpeg',
          createdAt: NOW,
        }),
      );
    });

    it('возвращает MediaAlreadyExistsError если файл уже существует', () => {
      const state = makeTemporaryMedia();
      const result = mediaDecide(state, {
        type: 'UploadMedia',
        id: MEDIA_ID,
        mediaType: 'image',
        name: 'photo.jpg',
        bucket: 'public',
        mimeType: 'image/jpeg',
        now: NOW,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('media_already_exists');
      }
    });
  });

  describe('UseMedia', () => {
    it('возвращает media.used для temporary файла', () => {
      const state = makeTemporaryMedia();
      const result = mediaDecide(state, {
        type: 'UseMedia',
        now: LATER,
      });

      expect(result).toEqual(
        Right({
          type: 'media.used',
          usedAt: LATER,
        }),
      );
    });

    it('возвращает MediaNotFoundError если state = null', () => {
      const result = mediaDecide(null, {
        type: 'UseMedia',
        now: LATER,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('media_not_found');
      }
    });

    it('возвращает MediaAlreadyInUseError если файл уже permanent', () => {
      const state = makePermanentMedia();
      const result = mediaDecide(state, {
        type: 'UseMedia',
        now: LATER,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('media_already_in_use');
      }
    });
  });

  describe('FreeMedia', () => {
    it('возвращает media.freed для существующего файла', () => {
      const state = makeTemporaryMedia();
      const result = mediaDecide(state, { type: 'FreeMedia' });

      expect(result).toEqual(Right({ type: 'media.freed' }));
    });

    it('возвращает media.freed для permanent файла', () => {
      const state = makePermanentMedia();
      const result = mediaDecide(state, { type: 'FreeMedia' });

      expect(result).toEqual(Right({ type: 'media.freed' }));
    });

    it('возвращает MediaNotFoundError если state = null', () => {
      const result = mediaDecide(null, { type: 'FreeMedia' });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('media_not_found');
      }
    });
  });
});
