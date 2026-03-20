import { describe, expect, it } from 'vitest';

import { type MediaEntity, MediaEntity as Media } from './entity.js';
import { VideoDetailsEntity } from './entities/video-details.entity.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { MediaId } from '@/kernel/domain/ids.js';

// ─── Хелперы ────────────────────────────────────────────────────────────────

const MEDIA_ID = MediaId.raw('file-1');
const THUMBNAIL_ID = MediaId.raw('thumb-1');
const NOW = new Date('2024-06-01T12:00:00.000Z');
const LATER = new Date('2024-06-02T12:00:00.000Z');

const makeTemporaryMedia = (): MediaEntity => ({
  id: MEDIA_ID,
  type: 'image',
  name: 'photo.jpg',
  bucket: 'public',
  mimeType: 'image/jpeg',
  isTemporary: true,
  createdAt: NOW,
});

const makePermanentMedia = (): MediaEntity => ({
  ...makeTemporaryMedia(),
  isTemporary: false,
});

const makeVideoMedia = (): MediaEntity => ({
  id: MEDIA_ID,
  type: 'video',
  name: 'clip.mp4',
  bucket: 'public',
  mimeType: 'video/mp4',
  isTemporary: true,
  createdAt: NOW,
});

const makePendingVideoDetails = (): VideoDetailsEntity => ({
  mediaId: MEDIA_ID,
  processingStatus: 'pending',
  thumbnailMediaId: null,
  hlsManifestKey: null,
  mp4PreviewKey: null,
  duration: null,
});

const makeProcessingVideoDetails = (): VideoDetailsEntity => ({
  ...makePendingVideoDetails(),
  processingStatus: 'processing',
});

// ─── MediaEntity ─────────────────────────────────────────────────────────────

describe('MediaEntity', () => {
  describe('upload', () => {
    it('создаёт state с isTemporary = true', () => {
      const result = Media.upload({
        id: MEDIA_ID,
        mediaType: 'image',
        name: 'photo.jpg',
        bucket: 'public',
        mimeType: 'image/jpeg',
        now: NOW,
      });

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.state).toEqual({
          id: MEDIA_ID,
          type: 'image',
          name: 'photo.jpg',
          bucket: 'public',
          mimeType: 'image/jpeg',
          isTemporary: true,
          createdAt: NOW,
        });
        expect(result.value.event.type).toBe('media.uploaded');
      }
    });
  });

  describe('use', () => {
    it('устанавливает isTemporary = false для temporary файла', () => {
      const state = makeTemporaryMedia();
      const result = Media.use(state, { now: LATER });

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.state.isTemporary).toBe(false);
        expect(result.value.event).toEqual({ type: 'media.used', usedAt: LATER });
      }
    });

    it('возвращает MediaAlreadyInUseError если файл уже permanent', () => {
      const state = makePermanentMedia();
      const result = Media.use(state, { now: LATER });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('media_already_in_use');
      }
    });
  });

  describe('free', () => {
    it('возвращает state: null и событие media.freed', () => {
      const state = makeTemporaryMedia();
      const result = Media.free(state);
      expect(result.state).toBeNull();
      expect(result.event.type).toBe('media.freed');
    });
  });

  describe('initiateProcessing', () => {
    it('возвращает videoDetails со статусом processing', () => {
      const state = makeVideoMedia();
      const details = makePendingVideoDetails();
      const result = Media.initiateProcessing(state, details);

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.videoDetails.processingStatus).toBe('processing');
        expect(result.value.event.type).toBe('video.processing-initiated');
      }
    });

    it('возвращает MediaNotVideoError для image media', () => {
      const state = makeTemporaryMedia();
      const result = Media.initiateProcessing(state, null);

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('media_not_video');
      }
    });

    it('возвращает VideoAlreadyProcessingError если уже processing', () => {
      const state = makeVideoMedia();
      const details = makeProcessingVideoDetails();
      const result = Media.initiateProcessing(state, details);

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('video_already_processing');
      }
    });
  });

  describe('completeProcessing', () => {
    it('возвращает videoDetails со статусом ready и данными', () => {
      const state = makeVideoMedia();
      const details = makeProcessingVideoDetails();
      const result = Media.completeProcessing(state, details, {
        thumbnailMediaId: THUMBNAIL_ID,
        hlsManifestKey: 'video/file-1/master.m3u8',
        mp4PreviewKey: 'video/file-1/preview.mp4',
        duration: 120,
      });

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.videoDetails).toEqual({
          mediaId: MEDIA_ID,
          processingStatus: 'ready',
          thumbnailMediaId: THUMBNAIL_ID,
          hlsManifestKey: 'video/file-1/master.m3u8',
          mp4PreviewKey: 'video/file-1/preview.mp4',
          duration: 120,
        });
        expect(result.value.event.type).toBe('video.processing-completed');
      }
    });

    it('возвращает VideoNotPendingError если статус не processing', () => {
      const state = makeVideoMedia();
      const details = makePendingVideoDetails();
      const result = Media.completeProcessing(state, details, {
        thumbnailMediaId: THUMBNAIL_ID,
        hlsManifestKey: 'video/file-1/master.m3u8',
        mp4PreviewKey: 'video/file-1/preview.mp4',
        duration: 120,
      });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('video_not_pending');
      }
    });
  });

  describe('failProcessing', () => {
    it('возвращает videoDetails со статусом failed', () => {
      const state = makeVideoMedia();
      const details = makeProcessingVideoDetails();
      const result = Media.failProcessing(state, details, { reason: 'codec error' });

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.videoDetails.processingStatus).toBe('failed');
        expect(result.value.event).toEqual({
          type: 'video.processing-failed',
          mediaId: MEDIA_ID,
          reason: 'codec error',
        });
      }
    });

    it('возвращает VideoNotPendingError если статус не processing', () => {
      const state = makeVideoMedia();
      const details = makePendingVideoDetails();
      const result = Media.failProcessing(state, details, { reason: 'error' });

      expect(isLeft(result)).toBe(true);
      if (isLeft(result)) {
        expect(result.error.type).toBe('video_not_pending');
      }
    });
  });
});

// ─── VideoDetailsEntity ──────────────────────────────────────────────────────

describe('VideoDetailsEntity', () => {
  describe('create', () => {
    it('создаёт pending VideoDetails', () => {
      const details = VideoDetailsEntity.create(MEDIA_ID);
      expect(details).toEqual({
        mediaId: MEDIA_ID,
        processingStatus: 'pending',
        thumbnailMediaId: null,
        hlsManifestKey: null,
        mp4PreviewKey: null,
        duration: null,
      });
    });
  });

  describe('initiateProcessing', () => {
    it('переводит в processing', () => {
      const details = makePendingVideoDetails();
      const result = VideoDetailsEntity.initiateProcessing(details);

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.state.processingStatus).toBe('processing');
      }
    });
  });

  describe('completeProcessing', () => {
    it('переводит в ready с данными', () => {
      const details = makeProcessingVideoDetails();
      const result = VideoDetailsEntity.completeProcessing(details, {
        thumbnailMediaId: THUMBNAIL_ID,
        hlsManifestKey: 'video/file-1/master.m3u8',
        mp4PreviewKey: 'video/file-1/preview.mp4',
        duration: 120,
      });

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.state).toEqual({
          mediaId: MEDIA_ID,
          processingStatus: 'ready',
          thumbnailMediaId: THUMBNAIL_ID,
          hlsManifestKey: 'video/file-1/master.m3u8',
          mp4PreviewKey: 'video/file-1/preview.mp4',
          duration: 120,
        });
      }
    });
  });

  describe('failProcessing', () => {
    it('переводит в failed', () => {
      const details = makeProcessingVideoDetails();
      const result = VideoDetailsEntity.failProcessing(details);

      expect(isLeft(result)).toBe(false);
      if (!isLeft(result)) {
        expect(result.value.state.processingStatus).toBe('failed');
      }
    });
  });
});
