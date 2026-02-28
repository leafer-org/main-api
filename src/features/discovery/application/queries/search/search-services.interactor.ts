import { Inject, Injectable } from '@nestjs/common';

import type { CategoryId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo.js';
import { Right } from '@/infra/lib/box.js';
import { ServiceSearchQueryPort } from '../../ports.js';

@Injectable()
export class SearchServicesInteractor {
  public constructor(
    @Inject(ServiceSearchQueryPort) private readonly searchQuery: ServiceSearchQueryPort,
  ) {}

  public async execute(command: {
    query?: string;
    categoryId?: CategoryId;
    ageGroup?: AgeGroup;
    cursor?: string;
    limit: number;
  }) {
    const result = await this.searchQuery.search(command);
    return Right(result);
  }
}
