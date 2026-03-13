import { Inject, Injectable } from '@nestjs/common';

import type { TriggerScope } from '../../../domain/vo/triggers.js';
import { TRIGGER_META } from '../../../domain/vo/triggers.js';
import { isLeft } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetTriggersQuery {
  public constructor(
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(params?: { scope?: TriggerScope }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageTicketBoard);
    if (isLeft(auth)) return auth;

    const entries = Object.entries(TRIGGER_META) as [
      string,
      (typeof TRIGGER_META)[keyof typeof TRIGGER_META],
    ][];

    const triggers = entries
      .filter(([, meta]) => !params?.scope || meta.scope === params.scope)
      .map(([triggerId, meta]) => ({ triggerId, ...meta }));

    return { type: 'success' as const, value: triggers };
  }
}
