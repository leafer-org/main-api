import type { OrganizationId, UserId } from '@/kernel/domain/ids.js';

/**
 * Read-port для флага hasUnreadFreshPosts в discovery feed.
 * Реализуется в feature/posts (владелец organization_freshness + post_views).
 *
 * Семантика: для каждой orgId возвращается true если у орг есть пост,
 * который удовлетворяет:
 *   org.last_post_id IS NOT NULL
 *   AND org.last_post_id NOT IN viewed_last_posts_of_user
 *   AND org.last_post_at > now() - 7d
 *
 * Для анонимного запроса (userId == null) всегда возвращается пустой Set.
 *
 * Реализован одним батчем (не N+1) — UNION/JOIN по orgIds + user_id.
 */
export abstract class OrganizationFreshnessQueryPort {
  public abstract computeFreshOrgIds(
    userId: UserId | null,
    orgIds: readonly OrganizationId[],
  ): Promise<Set<string>>;
}
