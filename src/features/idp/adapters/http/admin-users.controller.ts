import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { SearchAdminUsersInteractor } from '../../application/queries/admin-users-list/search-admin-users.interactor.js';
import { JwtAuthGuard } from '@/infra/auth/jwt-auth.guard.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';

@Controller('admin/users')
@UseGuards(JwtAuthGuard)
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
