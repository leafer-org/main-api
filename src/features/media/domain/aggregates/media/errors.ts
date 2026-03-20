import { CreateDomainError } from '@/infra/ddd/error.js';

export class MediaAlreadyExistsError extends CreateDomainError('media_already_exists', 400) {}

export class MediaNotFoundError extends CreateDomainError('media_not_found', 404) {}

export class MediaAlreadyInUseError extends CreateDomainError('media_already_in_use', 400) {}

export class MediaNotVideoError extends CreateDomainError('media_not_video', 400) {}

export class MediaNotImageError extends CreateDomainError('media_not_image', 400) {}

export class VideoAlreadyProcessingError extends CreateDomainError('video_already_processing', 400) {}

export class VideoNotPendingError extends CreateDomainError('video_not_pending', 400) {}

export class VideoNotReadyError extends CreateDomainError('video_not_ready', 400) {}

export class MediaPreviewForbiddenError extends CreateDomainError('media_preview_forbidden', 403) {}
