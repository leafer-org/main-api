import { describe, expect, it } from 'vitest';

import { mediaApply, videoDetailsApply } from './apply.js';
import type { MediaState } from './state.js';
import type { VideoDetails } from './video-details.js';
import { MediaId } from '@/kernel/domain/ids.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const MEDIA_ID = MediaId.raw('file-1');
const THUMBNAIL_ID = MediaId.raw('thumb-1');
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

const makeVideoMedia = (): MediaState => ({
  id: MEDIA_ID,
  type: 'video',
  name: 'clip.mp4',
  bucket: 'public',
  mimeType: 'video/mp4',
  isTemporary: true,
  createdAt: NOW,
});

const makePendingVideoDetails = (): VideoDetails => ({
  mediaId: MEDIA_ID,
  processingStatus: 'pending',
  thumbnailMediaId: null,
  hlsManifestKey: null,
  duration: null,
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
      const result = mediaApply(state, { type: 'media.used', usedAt: LATER });

      expect(result).toEqual({ ...state, isTemporary: false });
    });

    it('выбрасывает ошибку если state = null', () => {
      expect(() => mediaApply(null, { type: 'media.used', usedAt: LATER })).toThrow(
        'State is required',
      );
    });
  });

  describe('media.freed', () => {
    it('возвращает null (агрегат удалён)', () => {
      const state = makeTemporaryMedia();
      const result = mediaApply(state, { type: 'media.freed' });
      expect(result).toBeNull();
    });
  });

  describe('video processing events', () => {
    it('не изменяет state для video.processing-initiated', () => {
      const state = makeVideoMedia();
      const result = mediaApply(state, {
        type: 'video.processing-initiated',
        mediaId: MEDIA_ID,
      });
      expect(result).toBe(state);
    });
  });
});

describe('videoDetailsApply', () => {
  describe('video.processing-initiated', () => {
    it('устанавливает статус processing', () => {
      const details = makePendingVideoDetails();
      const result = videoDetailsApply(details, {
        type: 'video.processing-initiated',
        mediaId: MEDIA_ID,
      });

      expect(result).toEqual({
        mediaId: MEDIA_ID,
        processingStatus: 'processing',
        thumbnailMediaId: null,
        hlsManifestKey: null,
        duration: null,
      });
    });
  });

  describe('video.processing-completed', () => {
    it('устанавливает статус ready и заполняет данные', () => {
      const details = { ...makePendingVideoDetails(), processingStatus: 'processing' as const };
      const result = videoDetailsApply(details, {
        type: 'video.processing-completed',
        mediaId: MEDIA_ID,
        thumbnailMediaId: THUMBNAIL_ID,
        hlsManifestKey: 'video/file-1/master.m3u8',
        duration: 120,
      });

      expect(result).toEqual({
        mediaId: MEDIA_ID,
        processingStatus: 'ready',
        thumbnailMediaId: THUMBNAIL_ID,
        hlsManifestKey: 'video/file-1/master.m3u8',
        duration: 120,
      });
    });
  });

  describe('video.processing-failed', () => {
    it('устанавливает статус failed', () => {
      const details = { ...makePendingVideoDetails(), processingStatus: 'processing' as const };
      const result = videoDetailsApply(details, {
        type: 'video.processing-failed',
        mediaId: MEDIA_ID,
        reason: 'codec error',
      });

      expect(result).toEqual({
        mediaId: MEDIA_ID,
        processingStatus: 'failed',
        thumbnailMediaId: null,
        hlsManifestKey: null,
        duration: null,
      });
    });
  });

  describe('non-video events', () => {
    it('возвращает details без изменений для media.used', () => {
      const details = makePendingVideoDetails();
      const result = videoDetailsApply(details, { type: 'media.used', usedAt: LATER });
      expect(result).toBe(details);
    });
  });
});
