import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import { BlockUserInteractor } from '../../application/use-cases/block-user/block-user.interactor.js';
import { UnblockUserInteractor } from '../../application/use-cases/block-user/unblock-user.interactor.js';
import { SearchAdminUsersInteractor } from '../../application/use-cases/admin-users-list/search-admin-users.interactor.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { UserId } from '@/kernel/domain/ids.js';

@Controller('admin/users')
export class AdminUsersController {
  public constructor(
    private readonly searchAdminUsers: SearchAdminUsersInteractor,
    private readonly blockUserInteractor: BlockUserInteractor,
    private readonly unblockUserInteractor: UnblockUserInteractor,
  ) {}

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

  @Post(':userId/block')
  @HttpCode(200)
  public async blockUser(
    @Param('userId') userId: string,
    @Body() body: PublicBody['blockUser'],
  ): Promise<PublicResponse['blockUser']> {
    const result = await this.blockUserInteractor.execute({
      userId: UserId.raw(userId),
      reason: body.reason,
    });

    if (isLeft(result)) {
      throw domainToHttpError<'blockUser'>(result.error.toResponse());
    }

    return {};
  }

  @Post(':userId/unblock')
  @HttpCode(200)
  public async unblockUser(
    @Param('userId') userId: string,
  ): Promise<PublicResponse['unblockUser']> {
    const result = await this.unblockUserInteractor.execute({
      userId: UserId.raw(userId),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'unblockUser'>(result.error.toResponse());
    }

    return {};
  }
}
