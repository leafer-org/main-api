import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { ChatOrganizationMembershipReadModel } from '../../../application/ports.js';
import { chatOrganizationMembers } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import { OrganizationId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleChatOrganizationMembershipReadModel extends ChatOrganizationMembershipReadModel {
  public constructor(private readonly txHost: TransactionHostPg) {
    super();
  }

  public async findOrganizationsWhereUserCanRespond(
    userId: UserId,
  ): Promise<OrganizationId[]> {
    const db = this.txHost.get(NO_TRANSACTION);
    const rows = await db
      .select({ organizationId: chatOrganizationMembers.organizationId })
      .from(chatOrganizationMembers)
      .where(eq(chatOrganizationMembers.userId, userId as string));
    return rows.map((r) => OrganizationId.raw(r.organizationId));
  }

  public async findUsersWhoCanRespondAs(orgId: OrganizationId): Promise<UserId[]> {
    const db = this.txHost.get(NO_TRANSACTION);
    const rows = await db
      .select({ userId: chatOrganizationMembers.userId })
      .from(chatOrganizationMembers)
      .where(eq(chatOrganizationMembers.organizationId, orgId as string));
    return rows.map((r) => UserId.raw(r.userId));
  }
}
