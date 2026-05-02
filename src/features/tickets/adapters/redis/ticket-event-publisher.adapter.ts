import { Injectable, Logger } from '@nestjs/common';

import { TicketEventPublisher } from '../../application/ports.js';
import type { TicketRealtimeEvent } from '../../domain/events/realtime-events.js';
import { RedisConnection } from '@/infra/lib/nest-redis/index.js';
import type { BoardId } from '@/kernel/domain/ids.js';

const CHANNEL_PREFIX = 'tickets:board:';

@Injectable()
export class RedisTicketEventPublisher implements TicketEventPublisher {
  private readonly logger = new Logger(RedisTicketEventPublisher.name);

  public constructor(private readonly redisConnection: RedisConnection) {}

  public async publish(event: TicketRealtimeEvent): Promise<void> {
    const payload = JSON.stringify(event);
    const channels = this.channelsFor(event);

    await Promise.all(
      channels.map((channel) =>
        this.redisConnection.redis.publish(channel, payload).catch((err: unknown) => {
          // Fire-and-forget: лог + swallow, транзакция уже закоммичена.
          this.logger.warn(`publish to ${channel} failed: ${String(err)}`);
        }),
      ),
    );
  }

  private channelsFor(event: TicketRealtimeEvent): string[] {
    if (event.type === 'ticket.moved') {
      return [channel(event.fromBoardId), channel(event.toBoardId)];
    }
    return [channel(event.boardId)];
  }
}

function channel(boardId: BoardId): string {
  return `${CHANNEL_PREFIX}${boardId as string}`;
}
