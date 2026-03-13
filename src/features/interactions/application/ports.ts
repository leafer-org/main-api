import type { InteractionType } from '@/kernel/domain/events/interaction.events.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

/** Запись взаимодействий в таблицу interactions. */
export abstract class InteractionWritePort {
  public abstract insert(params: {
    id: string;
    userId: UserId;
    itemId: ItemId;
    type: InteractionType;
    timestamp: Date;
  }): Promise<void>;

  public abstract insertBatch(
    rows: {
      id: string;
      userId: UserId;
      itemId: ItemId;
      type: InteractionType;
      timestamp: Date;
    }[],
  ): Promise<void>;
}

/** Проверка дедупликации views: был ли view за последний час. */
export abstract class InteractionDedupPort {
  public abstract filterRecentlyViewed(
    userId: UserId,
    itemIds: ItemId[],
    withinMs: number,
  ): Promise<ItemId[]>;
}

/** Публикация в interaction.streaming (direct Kafka, без outbox). */
export abstract class InteractionPublisherPort {
  public abstract publish(params: {
    id: string;
    userId: UserId;
    itemId: ItemId;
    interactionType: InteractionType;
    timestamp: Date;
  }): void;

  public abstract publishBatch(
    messages: {
      id: string;
      userId: UserId;
      itemId: ItemId;
      interactionType: InteractionType;
      timestamp: Date;
    }[],
  ): void;
}
