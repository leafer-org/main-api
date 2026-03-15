import { describe, expect, it } from 'vitest';

import { mediaDecide } from './decide.js';
import type { MediaState } from './state.js';
import type { VideoDetails } from './video-details.js';
import { isLeft, Right } from '@/infra/lib/box.js';
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

const makePermanentMedia = (): MediaState => ({
  ...makeTemporaryMedia(),
  isTemporary: false,
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

const makeProcessingVideoDetails = (): VideoDetails => ({
  ...makePendingVideoDetails(),
  processingStatus: 'processing',
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
      const result = mediaDecide(state, { type: 'UseMedia', now: LATER });

      expect(result).toEqual(Right({ type: 'media.used', usedAt: LATER }));
    });

    it('возвращает MediaNotFoundError если state = null', () => {
      const result = mediaDecide(null, { type: 'UseMedia', now: LATER });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('media_not_found');
      }
    });

    it('возвращает MediaAlreadyInUseError если файл уже permanent', () => {
      const state = makePermanentMedia();
      const result = mediaDecide(state, { type: 'UseMedia', now: LATER });

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

  describe('InitiateVideoProcessing', () => {
    it('возвращает video.processing-initiated для video media', () => {
      const state = makeVideoMedia();
      const details = makePendingVideoDetails();
      const result = mediaDecide(
        state,
        { type: 'InitiateVideoProcessing', mediaId: MEDIA_ID },
        details,
      );

      expect(result).toEqual(
        Right({ type: 'video.processing-initiated', mediaId: MEDIA_ID }),
      );
    });

    it('возвращает MediaNotVideoError для image media', () => {
      const state = makeTemporaryMedia();
      const result = mediaDecide(
        state,
        { type: 'InitiateVideoProcessing', mediaId: MEDIA_ID },
      );

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('media_not_video');
      }
    });

    it('возвращает VideoAlreadyProcessingError если уже processing', () => {
      const state = makeVideoMedia();
      const details = makeProcessingVideoDetails();
      const result = mediaDecide(
        state,
        { type: 'InitiateVideoProcessing', mediaId: MEDIA_ID },
        details,
      );

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('video_already_processing');
      }
    });
  });

  describe('CompleteVideoProcessing', () => {
    it('возвращает video.processing-completed для processing video', () => {
      const state = makeVideoMedia();
      const details = makeProcessingVideoDetails();
      const result = mediaDecide(
        state,
        {
          type: 'CompleteVideoProcessing',
          mediaId: MEDIA_ID,
          thumbnailMediaId: THUMBNAIL_ID,
          hlsManifestKey: 'video/file-1/master.m3u8',
          duration: 120,
        },
        details,
      );

      expect(result).toEqual(
        Right({
          type: 'video.processing-completed',
          mediaId: MEDIA_ID,
          thumbnailMediaId: THUMBNAIL_ID,
          hlsManifestKey: 'video/file-1/master.m3u8',
          duration: 120,
        }),
      );
    });

    it('возвращает VideoNotPendingError если статус не processing', () => {
      const state = makeVideoMedia();
      const details = makePendingVideoDetails();
      const result = mediaDecide(
        state,
        {
          type: 'CompleteVideoProcessing',
          mediaId: MEDIA_ID,
          thumbnailMediaId: THUMBNAIL_ID,
          hlsManifestKey: 'video/file-1/master.m3u8',
          duration: 120,
        },
        details,
      );

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('video_not_pending');
      }
    });
  });

  describe('FailVideoProcessing', () => {
    it('возвращает video.processing-failed для processing video', () => {
      const state = makeVideoMedia();
      const details = makeProcessingVideoDetails();
      const result = mediaDecide(
        state,
        { type: 'FailVideoProcessing', mediaId: MEDIA_ID, reason: 'codec error' },
        details,
      );

      expect(result).toEqual(
        Right({
          type: 'video.processing-failed',
          mediaId: MEDIA_ID,
          reason: 'codec error',
        }),
      );
    });

    it('возвращает VideoNotPendingError если статус не processing', () => {
      const state = makeVideoMedia();
      const details = makePendingVideoDetails();
      const result = mediaDecide(
        state,
        { type: 'FailVideoProcessing', mediaId: MEDIA_ID, reason: 'error' },
        details,
      );

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('video_not_pending');
      }
    });
  });
});
