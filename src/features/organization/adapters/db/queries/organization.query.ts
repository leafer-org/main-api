import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { OrganizationDetailReadModel } from '../../../domain/read-models/organization-detail.read-model.js';
import type { EmployeeListReadModel } from '../../../domain/read-models/employee-list.read-model.js';
import type { EmployeeRoleListReadModel } from '../../../domain/read-models/employee-role-list.read-model.js';
import { OrganizationQueryPort } from '../../../application/ports.js';
import { OrganizationDatabaseClient } from '../client.js';
import { organizations } from '../schema.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';
import type { OrganizationJsonState } from '../json-state.js';

@Injectable()
export class DrizzleOrganizationQuery implements OrganizationQueryPort {
  public constructor(
    @Inject(OrganizationDatabaseClient) private readonly db: OrganizationDatabaseClient,
  ) {}

  public async findDetail(id: OrganizationId): Promise<OrganizationDetailReadModel | null> {
    const rows = await this.db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;

    const s = row.state as OrganizationJsonState;

    return {
      id: s.id as OrganizationDetailReadModel['id'],
      infoDraft: s.infoDraft as OrganizationDetailReadModel['infoDraft'],
      infoPublication: s.infoPublication
        ? {
            name: s.infoPublication.name,
            description: s.infoPublication.description,
            avatarId: (s.infoPublication.avatarId ?? null) as OrganizationDetailReadModel['infoPublication'] extends infer T ? T extends { avatarId: infer A } ? A : never : never,
            publishedAt: new Date(s.infoPublication.publishedAt),
          }
        : null,
      subscription: s.subscription as OrganizationDetailReadModel['subscription'],
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    };
  }

  public async findEmployees(id: OrganizationId): Promise<EmployeeListReadModel> {
    const rows = await this.db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    const row = rows[0];
    if (!row) return { employees: [] };

    const s = row.state as OrganizationJsonState;
    const roleMap = new Map(s.roles.map((r) => [r.id, r.name]));

    return {
      employees: s.employees.map((e) => ({
        userId: e.userId as EmployeeListReadModel['employees'][0]['userId'],
        roleId: e.roleId as EmployeeListReadModel['employees'][0]['roleId'],
        roleName: roleMap.get(e.roleId) ?? '',
        isOwner: e.isOwner,
        joinedAt: new Date(e.joinedAt),
      })),
    };
  }

  public async findRoles(id: OrganizationId): Promise<EmployeeRoleListReadModel> {
    const rows = await this.db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    const row = rows[0];
    if (!row) return { roles: [] };

    const s = row.state as OrganizationJsonState;

    return {
      roles: s.roles.map((r) => ({
        id: r.id as EmployeeRoleListReadModel['roles'][0]['id'],
        name: r.name,
        permissions: r.permissions as EmployeeRoleListReadModel['roles'][0]['permissions'],
      })),
    };
  }
}
