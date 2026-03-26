import type { Request } from 'express';
import type { GetDownloadUrlOptions, ImageProxyOptions } from '@/kernel/application/ports/media.js';

const BASE_CARD_WIDTH = 400;
const BASE_DETAIL_WIDTH = 400;
const BASE_AVATAR_SIZE = 64;
const DEFAULT_DPR = 3;
const MAX_DPR = 4;

function parseDpr(req: Request): number {
  const raw = req.headers['x-device-dpr'];
  if (!raw) return DEFAULT_DPR;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_DPR;
  return Math.min(value, MAX_DPR);
}

export function cardImageOptions(req: Request): GetDownloadUrlOptions {
  const dpr = parseDpr(req);
  return {
    visibility: 'PUBLIC',
    imageProxy: { width: Math.round(BASE_CARD_WIDTH * dpr), quality: 80, format: 'webp' },
  };
}

export function detailImageOptions(req: Request): GetDownloadUrlOptions {
  const dpr = parseDpr(req);
  return {
    visibility: 'PUBLIC',
    imageProxy: { width: Math.round(BASE_DETAIL_WIDTH * dpr), quality: 85, format: 'webp' },
  };
}

export function avatarImageProxy(req: Request): ImageProxyOptions {
  const dpr = parseDpr(req);
  const size = Math.round(BASE_AVATAR_SIZE * dpr);
  return { width: size, height: size };
}
