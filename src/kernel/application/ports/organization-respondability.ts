import type { OrganizationId, UserId } from '@/kernel/domain/ids.js';

/**
 * Sync-порт для авторизационных проверок «организация ↔ user» из других фич
 * (chat в первую очередь). Реализуется в feature/organization и читает
 * организационные таблицы напрямую.
 *
 * Используется на write-path (claim/send/open chat) — отвечает свежими данными
 * в момент действия, в отличие от eventually-consistent проекций.
 */
export abstract class OrganizationRespondabilityPort {
  /**
   * Существует ли организация (записана в системе, не draft-stub).
   * Используется в OpenChat для валидации orgId.
   */
  public abstract exists(orgId: OrganizationId): Promise<boolean>;

  /**
   * Имеет ли user право отвечать в чатах от лица данной организации.
   * MVP: любой member; в будущем — учёт роли и флага can_respond_in_chats.
   */
  public abstract canRespondAsOrganization(
    orgId: OrganizationId,
    userId: UserId,
  ): Promise<boolean>;

  /**
   * Список userId, которые сейчас имеют право отвечать в чатах от лица этой
   * организации. Используется консьюмерами тонкого `organization.changed`
   * для ре-синка локальных проекций членства (chat slot-pool).
   */
  public abstract findRespondableUserIds(orgId: OrganizationId): Promise<UserId[]>;
}
