import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { OrganizationDetailReadModel } from '../../../domain/read-models/organization-detail.read-model.js';
import type { EmployeeListReadModel } from '../../../domain/read-models/employee-list.read-model.js';
import type { EmployeeRoleListReadModel } from '../../../domain/read-models/employee-role-list.read-model.js';
import { OrganizationQueryPort } from '../../../application/ports.js';
import { OrganizationDatabaseClient } from '../client.js';
import { organizations } from '../schema.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleOrganizationQuery implements OrganizationQueryPort {
  public constructor(
    @Inject(OrganizationDatabaseClient) private readonly db: OrganizationDatabaseClient,
  ) {}

  public async findDetail(id: OrganizationId): Promise<OrganizationDetailReadModel | null> {
    const rows = await this.db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;

    const state = row.state as Record<string, unknown>;

    return {
      id: state['id'] as OrganizationDetailReadModel['id'],
      infoDraft: state['infoDraft'] as OrganizationDetailReadModel['infoDraft'],
      infoPublication: state['infoPublication']
        ? {
            ...(state['infoPublication'] as Record<string, unknown>),
            publishedAt: new Date(
              (state['infoPublication'] as Record<string, unknown>)['publishedAt'] as string,
            ),
          } as OrganizationDetailReadModel['infoPublication']
        : null,
      subscription: {
        planId: (state['subscription'] as Record<string, unknown>)['planId'],
        maxEmployees: (state['subscription'] as Record<string, unknown>)['maxEmployees'],
        maxPublishedItems: (state['subscription'] as Record<string, unknown>)['maxPublishedItems'],
      } as OrganizationDetailReadModel['subscription'],
      createdAt: new Date(state['createdAt'] as string),
      updatedAt: new Date(state['updatedAt'] as string),
    };
  }

  public async findEmployees(id: OrganizationId): Promise<EmployeeListReadModel> {
    const rows = await this.db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    const row = rows[0];
    if (!row) return { employees: [] };

    const state = row.state as Record<string, unknown>;
    const employees = state['employees'] as Array<Record<string, unknown>>;
    const roles = state['roles'] as Array<Record<string, unknown>>;
    const roleMap = new Map(roles.map((r) => [r['id'] as string, r['name'] as string]));

    return {
      employees: employees.map((e) => ({
        userId: e['userId'] as EmployeeListReadModel['employees'][0]['userId'],
        roleId: e['roleId'] as EmployeeListReadModel['employees'][0]['roleId'],
        roleName: roleMap.get(e['roleId'] as string) ?? '',
        isOwner: e['isOwner'] as boolean,
        joinedAt: new Date(e['joinedAt'] as string),
      })),
    };
  }

  public async findRoles(id: OrganizationId): Promise<EmployeeRoleListReadModel> {
    const rows = await this.db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    const row = rows[0];
    if (!row) return { roles: [] };

    const state = row.state as Record<string, unknown>;
    const roles = state['roles'] as Array<Record<string, unknown>>;

    return {
      roles: roles.map((r) => ({
        id: r['id'] as EmployeeRoleListReadModel['roles'][0]['id'],
        name: r['name'] as string,
        permissions: r['permissions'] as EmployeeRoleListReadModel['roles'][0]['permissions'],
      })),
    };
  }
}
