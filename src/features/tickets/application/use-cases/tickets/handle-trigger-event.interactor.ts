import { Inject, Injectable } from '@nestjs/common';

import { BoardSubscriptionEntity } from '../../../domain/aggregates/board/entities/board-subscription.entity.js';
import { TicketEntity } from '../../../domain/aggregates/ticket/entity.js';
import type { TriggerEvent } from '../../../domain/events/trigger-events.js';
import { matchesSubscriptionFilters } from '../../../domain/services/subscription-filter.service.js';
import type { TicketData } from '../../../domain/vo/ticket-data.js';
import type { TriggerId } from '../../../domain/vo/triggers.js';
import type { TicketRealtimeCreatedEvent } from '../../../domain/events/realtime-events.js';
import {
  BoardRepository,
  TicketEventPublisher,
  TicketIdGenerator,
  TicketRepository,
} from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { UserId, type CategoryId } from '@/kernel/domain/ids.js';
import type { ItemWidget } from '@/kernel/domain/vo/widget.js';

type MappedEvent = {
  triggerId: TriggerId;
  eventId: string;
  message: string;
  data: TicketData;
};

@Injectable()
export class HandleTriggerEventInteractor {
  public constructor(
    @Inject(TicketRepository) private readonly ticketRepo: TicketRepository,
    @Inject(BoardRepository) private readonly boardRepo: BoardRepository,
    @Inject(TicketIdGenerator) private readonly idGenerator: TicketIdGenerator,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(TicketEventPublisher) private readonly publisher: TicketEventPublisher,
  ) {}

  public async execute(event: TriggerEvent): Promise<void> {
    const mapped = this.mapEvent(event);
    const createdEvents: TicketRealtimeCreatedEvent[] = [];
    const systemUser = UserId.raw('system');

    await this.txHost.startTransaction(async (tx) => {
      const alreadyExists = await this.ticketRepo.existsByEventId(tx, mapped.eventId);
      if (alreadyExists) return;

      const boards = await this.boardRepo.findByTrigger(tx, mapped.triggerId);

      for (const board of boards) {
        const subscriptions = BoardSubscriptionEntity.findByTrigger(
          board.subscriptions,
          mapped.triggerId,
        );

        for (const subscription of subscriptions) {
          if (!matchesSubscriptionFilters(subscription, mapped.eventId)) continue;

          const ticketId = this.idGenerator.generateTicketId();
          const now = this.clock.now();

          const result = TicketEntity.create({
            type: 'CreateTicket',
            ticketId,
            boardId: board.boardId,
            message: mapped.message,
            data: mapped.data,
            triggerId: mapped.triggerId,
            eventId: mapped.eventId,
            createdBy: systemUser,
            now,
          });

          if (isLeft(result)) continue;

          await this.ticketRepo.save(tx, result.value.state);
          createdEvents.push({
            type: 'ticket.created',
            ticketId,
            boardId: board.boardId,
            triggerId: mapped.triggerId,
            createdBy: systemUser,
          });
          break; // one ticket per board
        }
      }
    });

    for (const created of createdEvents) {
      await this.publisher.publish(created);
    }
  }

  private mapEvent(event: TriggerEvent): MappedEvent {
    switch (event.type) {
      case 'item.moderation-requested': {
        const baseInfo = event.widgets.find(
          (w): w is Extract<ItemWidget, { type: 'base-info' }> => w.type === 'base-info',
        );
        return {
          triggerId: 'item-moderation.requested',
          eventId: event.id,
          message: `Модерация товара: ${baseInfo?.title ?? 'без названия'}`,
          data: {
            item: {
              id: event.itemId,
              organizationId: event.organizationId,
              typeId: event.typeId,
              title: baseInfo?.title ?? '',
              description: baseInfo?.description ?? '',
              imageId: baseInfo?.media[0]?.mediaId ?? null,
              categoryIds: extractCategoryIds(event.widgets),
            },
          },
        };
      }
      case 'organization.moderation-requested':
        return {
          triggerId: 'organization-moderation.requested',
          eventId: event.id,
          message: `Модерация организации: ${event.name}`,
          data: {
            organization: {
              id: event.organizationId,
              name: event.name,
              description: event.description,
              avatarId: event.avatarId,
            },
          },
        };
    }
  }
}

function extractCategoryIds(widgets: ItemWidget[]): CategoryId[] {
  const categoryWidget = widgets.find(
    (w): w is Extract<ItemWidget, { type: 'category' }> => w.type === 'category',
  );
  return categoryWidget?.categoryIds ?? [];
}
