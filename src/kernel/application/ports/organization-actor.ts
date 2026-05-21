import type { OrganizationId, UserId } from '@/kernel/domain/ids.js';

/**
 * Capability, с которой user пытается действовать от лица организации.
 * Расширяется по мере добавления org-фич.
 *
 * v1: все capability коллапсируют в «user — сотрудник орг» (см. адаптер).
 * Расширение до per-role / per-flag — будущая итерация без миграции схемы.
 */
export type OrgCapability =
  | 'chat.respond'
  | 'posts.publish'
  | 'posts.moderate-comments'
  | 'tickets.handle'
  | 'tickets.manage-boards';

/**
 * Унифицированный sync-порт «может ли user действовать от лица организации
 * с заданной capability». Реализуется в feature/organization, читает
 * организационные таблицы напрямую.
 *
 * Используется на write-path (publish post, claim chat slot, edit comment …) —
 * отвечает свежими данными в момент действия, в отличие от eventually-
 * consistent проекций.
 */
export abstract class OrganizationActorPort {
  public abstract canActAs(
    orgId: OrganizationId,
    userId: UserId,
    capability: OrgCapability,
  ): Promise<boolean>;
}
