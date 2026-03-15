import { describe, expect, it } from 'vitest';

import { mediaApply } from './apply.js';
import type { MediaState } from './state.js';
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

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('mediaApply', () => {
  describe('media.uploaded', () => {
    it('создаёт MediaState из null с isTemporary = true', () => {
      const result = mediaApply(null, {
        type: 'media.uploaded',
        id: MEDIA_ID,
        mediaType: 'image',
        name: 'photo.jpg',
        bucket: 'public',
        mimeType: 'image/jpeg',
        createdAt: NOW,
      });

      expect(result).toEqual({
        id: MEDIA_ID,
        type: 'image',
        name: 'photo.jpg',
        bucket: 'public',
        mimeType: 'image/jpeg',
        isTemporary: true,
        createdAt: NOW,
      });
    });
  });

  describe('media.used', () => {
    it('устанавливает isTemporary = false', () => {
      const state = makeTemporaryMedia();
      const result = mediaApply(state, {
        type: 'media.used',
        usedAt: LATER,
      });

      expect(result).toEqual({
        ...state,
        isTemporary: false,
      });
    });

    it('выбрасывает ошибку если state = null', () => {
      expect(() =>
        mediaApply(null, {
          type: 'media.used',
          usedAt: LATER,
        }),
      ).toThrow('State is required');
    });
  });

  describe('media.freed', () => {
    it('возвращает null (агрегат удалён)', () => {
      const state = makeTemporaryMedia();
      const result = mediaApply(state, { type: 'media.freed' });

      expect(result).toBeNull();
    });
  });
});
