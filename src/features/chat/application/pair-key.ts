import type { ParticipantKind } from '../domain/vo/participant-kind.js';

/**
 * Детерминированный ключ для уникальности чата по multiset участников.
 * Сортируется лексикографически по "kind:subjectId", join'ится через "|".
 *
 * Примеры:
 *   user U + organization O   → "organization:O|user:U"
 *   user U + support          → "support:|user:U"
 *   support + organization O  → "organization:O|support:"
 */
export function pairKeyOf(
  participants: ReadonlyArray<{ kind: ParticipantKind; subjectId: string | null }>,
): string {
  return participants
    .map((p) => `${p.kind}:${p.subjectId ?? ''}`)
    .sort()
    .join('|');
}
