import { Controller, Get, Query } from '@nestjs/common';

import { SearchAdminUsersInteractor } from '../../application/use-cases/admin-users-list/search-admin-users.interactor.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';

@Controller('admin/users')
export class AdminUsersController {
  public constructor(private readonly searchAdminUsers: SearchAdminUsersInteractor) {}

  @Get()
  public async search(
    @Query('query') query?: string,
    @Query('role') role?: string,
    @Query('from') from?: string,
    @Query('size') size?: string,
  ): Promise<PublicResponse['searchAdminUsers']> {
    const result = await this.searchAdminUsers.execute({
      query,
      role,
      from: from ? Number(from) : undefined,
      size: size ? Number(size) : undefined,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'searchAdminUsers'>(result.error.toResponse());
    }

    return result.value;
  }
}
