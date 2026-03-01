import { Inject, Injectable } from '@nestjs/common';

import { ServiceFeedQueryPort } from '../../ports.js';
import { Right } from '@/infra/lib/box.js';
import type { CategoryId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

@Injectable()
export class GetFeedInteractor {
  public constructor(
    @Inject(ServiceFeedQueryPort) private readonly feedQuery: ServiceFeedQueryPort,
  ) {}

  public async execute(command: {
    cursor?: string;
    limit: number;
    ageGroup?: AgeGroup;
    categoryId?: CategoryId;
  }) {
    const result = await this.feedQuery.findFeed(command);
    return Right(result);
  }
}
