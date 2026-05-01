import { Inject, Injectable } from '@nestjs/common';

import { type FilterCategory, FILTER_META } from '../../../domain/vo/filters.js';
import { isLeft } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetFiltersQuery {
  public constructor(
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(params?: { category?: FilterCategory }) {
    const auth = await this.permissionCheck.mustCan(Permission.TicketBoardRead);
    if (isLeft(auth)) return auth;

    const entries = Object.entries(FILTER_META) as [
      string,
      (typeof FILTER_META)[keyof typeof FILTER_META],
    ][];

    const filters = entries
      .filter(([, meta]) => !params?.category || meta.categories.includes(params.category))
      .map(([type, meta]) => ({
        type,
        name: meta.name,
        categories: meta.categories,
        params: meta.params,
      }));

    return { type: 'success' as const, value: filters };
  }
}
