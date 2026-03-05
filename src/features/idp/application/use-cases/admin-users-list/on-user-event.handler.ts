import { Inject, Injectable } from '@nestjs/common';

import type { UserStreamingMessage } from '../../../adapters/kafka/topics.js';
import type { AdminUsersListReadModel } from '../../../domain/read-models/admin-users-list/admin-users-list.read-model.js';
import { AdminUsersListRepository } from '../../ports.js';

@Injectable()
export class OnUserEventHandler {
  public constructor(
    @Inject(AdminUsersListRepository)
    private readonly repo: AdminUsersListRepository,
  ) {}

  public async handleBatch(events: UserStreamingMessage[]): Promise<void> {
    const latest = new Map<string, UserStreamingMessage>();
    for (const event of events) {
      latest.set(event.userId, event);
    }

    const models: AdminUsersListReadModel[] = [...latest.values()].map((e) => ({
      userId: e.userId,
      phoneNumber: e.phoneNumber,
      fullName: e.fullName,
      role: e.role,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));

    await this.repo.saveBatch(models);
  }
}
