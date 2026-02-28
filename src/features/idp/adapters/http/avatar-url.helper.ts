import type { PublicSchemas } from '@/infra/contracts/types.js';
import type { MediaService } from '@/kernel/application/ports/media.js';
import type { FileId } from '@/kernel/domain/ids.js';

const AVATAR_SIZES = {
  largeUrl: { width: 512, height: 512 },
  mediumUrl: { width: 256, height: 256 },
  smallUrl: { width: 128, height: 128 },
  thumbUrl: { width: 64, height: 64 },
} as const;

export async function resolveAvatarUrls(
  mediaService: MediaService,
  avatarId: FileId | undefined,
): Promise<PublicSchemas['Avatar'] | undefined> {
  if (!avatarId) return;

  const [largeUrl, mediumUrl, smallUrl, thumbUrl] = await mediaService.getDownloadUrls(
    Object.values(AVATAR_SIZES).map((imageProxy) => ({
      fileId: avatarId,
      options: { visibility: 'PUBLIC' as const, imageProxy },
    })),
  );

  if (!largeUrl || !mediumUrl || !smallUrl || !thumbUrl) return;

  return { largeUrl, mediumUrl, smallUrl, thumbUrl };
}
