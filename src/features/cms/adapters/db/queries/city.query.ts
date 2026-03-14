import { Injectable } from '@nestjs/common';

import { type CityListItem, CityQueryPort } from '../../../application/ports.js';
import { cmsCities } from '../schema.js';
import { ConnectionPool } from '@/infra/lib/nest-drizzle/index.js';

@Injectable()
export class DrizzleCityQuery implements CityQueryPort {
  public constructor(private readonly connectionPool: ConnectionPool) {}

  public async findAll(): Promise<CityListItem[]> {
    return this.connectionPool.db
      .select({
        id: cmsCities.id,
        name: cmsCities.name,
        lat: cmsCities.lat,
        lng: cmsCities.lng,
      })
      .from(cmsCities)
      .orderBy(cmsCities.name);
  }
}
