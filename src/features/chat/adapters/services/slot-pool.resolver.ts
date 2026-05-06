import { Inject, Injectable } from '@nestjs/common';

import { ChatOrganizationMembershipReadModel, SlotPoolResolver } from '../../application/ports.js';
import type { ParticipantKind } from '../../domain/vo/participant-kind.js';
import { OrganizationRespondabilityPort } from '@/kernel/application/ports/organization-respondability.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { OrganizationId, type UserId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

/**
 * Резолвер «может ли userId занять слот {kind, subjectId}».
 *
 * Каждый kind резолвится через подходящий источник:
 * - 'user'         : userId == subjectId (тривиально).
 * - 'organization' : sync-проверка через kernel-порт OrganizationRespondabilityPort
 *                    (на write-path нужны свежие данные, не eventually-consistent
 *                    проекция).
 * - 'support'      : permission chat.respond.support через PermissionCheckService —
 *                    проверка делается для CURRENT user текущего HTTP-запроса
 *                    (PermissionCheckService привязан к JWT контексту).
 *                    Резолвить этот kind для произвольного userId через
 *                    PermissionCheckService нельзя — но в MVP-сценариях
 *                    (claim, send) actorUserId всегда == current user.
 *
 * pool() возвращает список потенциальных исполнителей для уведомлений —
 * читается из chat-локальной проекции (eventually consistent ок).
 */
@Injectable()
export class DefaultSlotPoolResolver extends SlotPoolResolver {
  public constructor(
    @Inject(OrganizationRespondabilityPort)
    private readonly respondability: OrganizationRespondabilityPort,
    @Inject(ChatOrganizationMembershipReadModel)
    private readonly orgMembership: ChatOrganizationMembershipReadModel,
    @Inject(PermissionCheckService)
    private readonly permissionCheck: PermissionCheckService,
  ) {
    super();
  }

  public async canAssign(
    kind: ParticipantKind,
    subjectId: string | null,
    userId: UserId,
  ): Promise<boolean> {
    if (kind === 'user') {
      return subjectId === (userId as string);
    }
    if (kind === 'organization') {
      if (subjectId === null) return false;
      return this.respondability.canRespondAsOrganization(
        OrganizationId.raw(subjectId),
        userId,
      );
    }
    if (kind === 'support') {
      return this.permissionCheck.can(Permission.ChatRespondAsSupport);
    }
    return false;
  }

  public async pool(kind: ParticipantKind, subjectId: string | null): Promise<UserId[]> {
    if (kind === 'user') {
      return subjectId === null ? [] : [subjectId as UserId];
    }
    if (kind === 'organization') {
      if (subjectId === null) return [];
      return this.orgMembership.findUsersWhoCanRespondAs(OrganizationId.raw(subjectId));
    }
    return [];
  }
}
