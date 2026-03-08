import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { IdempotencyPort } from '../../../application/projection-ports.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryProcessedEvents } from '../schema.js';

@Injectable()
export class DrizzleIdempotencyRepository implements IdempotencyPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async isProcessed(eventId: string): Promise<boolean> {
    const rows = await this.dbClient.db
      .select({ eventId: discoveryProcessedEvents.eventId })
      .from(discoveryProcessedEvents)
      .where(eq(discoveryProcessedEvents.eventId, eventId))
      .limit(1);

    return rows.length > 0;
  }

  public async markProcessed(eventId: string): Promise<void> {
    await this.dbClient.db
      .insert(discoveryProcessedEvents)
      .values({ eventId })
      .onConflictDoNothing();
  }
}
