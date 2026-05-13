import { Inject, Injectable } from '@nestjs/common';

import type { UserStreamingMessage } from '../../../adapters/kafka/topics.js';
import type { AdminUsersListReadModel } from '../../../domain/read-models/admin-users-list/admin-users-list.read-model.js';
import { AdminUsersListRepository } from '../../ports.js';
import { UserDirectoryPort } from '@/kernel/application/ports/user-directory.js';
import { UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class OnUserEventHandler {
  public constructor(
    @Inject(AdminUsersListRepository)
    private readonly repo: AdminUsersListRepository,
    @Inject(UserDirectoryPort)
    private readonly userDirectory: UserDirectoryPort,
  ) {}

  public async handleBatch(events: UserStreamingMessage[]): Promise<void> {
    const latestIds = new Set<string>();
    for (const event of events) {
      latestIds.add(event.userId);
    }
    if (latestIds.size === 0) return;

    const users = await this.userDirectory.findByIds(
      [...latestIds].map((id) => UserId.raw(id)),
    );

    const models: AdminUsersListReadModel[] = users.map((u) => ({
      userId: u.userId as string,
      phoneNumber: u.phoneNumber,
      fullName: u.fullName,
      role: u.role,
      blockedAt: u.blockedAt ? u.blockedAt.toISOString() : null,
      blockReason: u.blockReason,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }));

    await this.repo.saveBatch(models);
  }
}
