import { Inject, Injectable } from '@nestjs/common';

import { type TriggerCategory, TRIGGER_META } from '../../../domain/vo/triggers.js';
import { isLeft } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetTriggersQuery {
  public constructor(
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(params?: { category?: TriggerCategory }) {
    const auth = await this.permissionCheck.mustCan(Permission.TicketBoardRead);
    if (isLeft(auth)) return auth;

    const entries = Object.entries(TRIGGER_META) as [
      string,
      (typeof TRIGGER_META)[keyof typeof TRIGGER_META],
    ][];

    const triggers = entries
      .filter(([, meta]) => !params?.category || meta.categories.includes(params.category))
      .map(([triggerId, meta]) => ({
        triggerId,
        name: meta.name,
        categories: meta.categories,
        params: meta.params,
      }));

    return { type: 'success' as const, value: triggers };
  }
}
