// --- Offset cursor (для personal sort / feed) ---

export function parseOffsetCursor(cursor?: string): number {
  return cursor ? Number.parseInt(cursor, 10) : 0;
}

export function nextOffsetCursor(
  offset: number,
  pageSize: number,
  limit: number,
  totalAvailable?: number,
): string | null {
  if (pageSize < limit) return null;
  const next = offset + pageSize;
  if (totalAvailable !== undefined && next >= totalAvailable) return null;
  return String(next);
}

// --- Base64url keyset cursor (для SQL / Meilisearch пагинации) ---

export function encodeCursor<T extends Record<string, unknown>>(data: T): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

export function decodeCursor<T>(cursor: string): T {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as T;
}
