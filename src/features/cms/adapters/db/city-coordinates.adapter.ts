import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { cmsCities } from './schema.js';
import { ConnectionPool } from '@/infra/lib/nest-drizzle/index.js';
import { CityCoordinatesPort } from '@/kernel/application/ports/city-coordinates.js';

@Injectable()
export class DrizzleCityCoordinatesAdapter implements CityCoordinatesPort {
  private readonly cache = new Map<string, { lat: number; lng: number } | null>();

  public constructor(private readonly connectionPool: ConnectionPool) {}

  public async findCoordinates(cityId: string): Promise<{ lat: number; lng: number } | null> {
    const cached = this.cache.get(cityId);
    if (cached !== undefined) return cached;

    const rows = await this.connectionPool.db
      .select({ lat: cmsCities.lat, lng: cmsCities.lng })
      .from(cmsCities)
      .where(eq(cmsCities.id, cityId))
      .limit(1);

    const result = rows[0] ?? null;
    this.cache.set(cityId, result);
    return result;
  }
}
