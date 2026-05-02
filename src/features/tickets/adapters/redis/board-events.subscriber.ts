import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';

import type { TicketRealtimeEvent } from '../../domain/events/realtime-events.js';
import { RedisConnection } from '@/infra/lib/nest-redis/index.js';
import type { BoardId } from '@/kernel/domain/ids.js';

const CHANNEL_PATTERN = 'tickets:board:*';
const CHANNEL_PREFIX = 'tickets:board:';

export type BoardEventListener = (event: TicketRealtimeEvent) => void;

// Один psubscribe('tickets:board:*') на под — без reference-counting.
// Каждый SSE-controller добавляет/удаляет listener для своего boardId.
@Injectable()
export class BoardEventsSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BoardEventsSubscriber.name);
  private readonly listeners = new Map<BoardId, Set<BoardEventListener>>();
  private subscriber: Redis | null = null;

  public constructor(private readonly redisConnection: RedisConnection) {}

  public async onModuleInit(): Promise<void> {
    this.subscriber = this.redisConnection.createSubscriber();
    this.subscriber.on('pmessage', (_pattern, channel, message) => this.dispatch(channel, message));
    await this.subscriber.psubscribe(CHANNEL_PATTERN);
    this.logger.log(`psubscribed to ${CHANNEL_PATTERN}`);
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.punsubscribe(CHANNEL_PATTERN);
    }
    this.listeners.clear();
  }

  public subscribe(boardId: BoardId, listener: BoardEventListener): () => void {
    let bucket = this.listeners.get(boardId);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(boardId, bucket);
    }
    bucket.add(listener);

    return () => {
      const current = this.listeners.get(boardId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.listeners.delete(boardId);
    };
  }

  private dispatch(channel: string, raw: string): void {
    if (!channel.startsWith(CHANNEL_PREFIX)) return;
    const boardId = channel.slice(CHANNEL_PREFIX.length) as BoardId;

    const bucket = this.listeners.get(boardId);
    if (!bucket || bucket.size === 0) return;

    let event: TicketRealtimeEvent;
    try {
      event = JSON.parse(raw) as TicketRealtimeEvent;
    } catch (err) {
      this.logger.warn(`failed to parse event from ${channel}: ${String(err)}`);
      return;
    }

    for (const listener of bucket) {
      try {
        listener(event);
      } catch (err) {
        this.logger.warn(`listener error for ${channel}: ${String(err)}`);
      }
    }
  }
}
