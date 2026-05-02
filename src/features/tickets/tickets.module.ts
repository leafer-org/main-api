import { Module } from '@nestjs/common';

import { TicketDatabaseClient } from './adapters/db/client.js';
import { TicketTriggerConsumerHandler } from './adapters/kafka/ticket-trigger-consumer.handler.js';
import { DrizzleBoardQuery } from './adapters/db/queries/board.query.js';
import { DrizzleTicketQuery } from './adapters/db/queries/ticket.query.js';
import { DrizzleBoardRepository } from './adapters/db/repositories/board.repository.js';
import { DrizzleTicketRepository } from './adapters/db/repositories/ticket.repository.js';
import { BoardStreamController } from './adapters/http/board-stream.controller.js';
import { BoardsController } from './adapters/http/boards.controller.js';
import { TicketsController } from './adapters/http/tickets.controller.js';
import { UuidTicketIdGenerator } from './adapters/id-generator.js';
import { BoardEventsSubscriber } from './adapters/redis/board-events.subscriber.js';
import { RedisTicketEventPublisher } from './adapters/redis/ticket-event-publisher.adapter.js';
import {
  BoardDetailQueryPort,
  BoardListQueryPort,
  BoardRepository,
  MyBoardsQueryPort,
  MyTicketsQueryPort,
  TicketDetailQueryPort,
  TicketEventPublisher,
  TicketIdGenerator,
  TicketListQueryPort,
  TicketRepository,
} from './application/ports.js';
import { AuthorizeBoardStreamQuery } from './application/use-cases/queries/authorize-board-stream.query.js';
import { AddAutomationInteractor } from './application/use-cases/boards/add-automation.interactor.js';
import { AddCloseSubscriptionInteractor } from './application/use-cases/boards/add-close-subscription.interactor.js';
import { AddMemberInteractor } from './application/use-cases/boards/add-member.interactor.js';
import { AddRedirectSubscriptionInteractor } from './application/use-cases/boards/add-redirect-subscription.interactor.js';
import { AddSubscriptionInteractor } from './application/use-cases/boards/add-subscription.interactor.js';
import { CreateBoardInteractor } from './application/use-cases/boards/create-board.interactor.js';
import { DeleteBoardInteractor } from './application/use-cases/boards/delete-board.interactor.js';
import { RemoveAutomationInteractor } from './application/use-cases/boards/remove-automation.interactor.js';
import { RemoveCloseSubscriptionInteractor } from './application/use-cases/boards/remove-close-subscription.interactor.js';
import { RemoveMemberInteractor } from './application/use-cases/boards/remove-member.interactor.js';
import { RemoveRedirectSubscriptionInteractor } from './application/use-cases/boards/remove-redirect-subscription.interactor.js';
import { RemoveSubscriptionInteractor } from './application/use-cases/boards/remove-subscription.interactor.js';
import { UpdateBoardInteractor } from './application/use-cases/boards/update-board.interactor.js';
import { GetBoardDetailQuery } from './application/use-cases/queries/get-board-detail.query.js';
import { GetBoardsQuery } from './application/use-cases/queries/get-boards.query.js';
import { GetMyBoardsQuery } from './application/use-cases/queries/get-my-boards.query.js';
import { GetMyTicketsQuery } from './application/use-cases/queries/get-my-tickets.query.js';
import { GetTicketDetailQuery } from './application/use-cases/queries/get-ticket-detail.query.js';
import { GetTicketsQuery } from './application/use-cases/queries/get-tickets.query.js';
import { GetFiltersQuery } from './application/use-cases/queries/get-filters.query.js';
import { GetTriggersQuery } from './application/use-cases/queries/get-triggers.query.js';
import { AddCommentInteractor } from './application/use-cases/tickets/add-comment.interactor.js';
import { AssignTicketInteractor } from './application/use-cases/tickets/assign-ticket.interactor.js';
import { CreateTicketInteractor } from './application/use-cases/tickets/create-ticket.interactor.js';
import { HandleCloseTriggerInteractor } from './application/use-cases/tickets/handle-close-trigger.interactor.js';
import { HandleTriggerEventInteractor } from './application/use-cases/tickets/handle-trigger-event.interactor.js';
import { MarkDoneInteractor } from './application/use-cases/tickets/mark-done.interactor.js';
import { MoveTicketInteractor } from './application/use-cases/tickets/move-ticket.interactor.js';
import { ReassignTicketInteractor } from './application/use-cases/tickets/reassign-ticket.interactor.js';
import { ReopenTicketInteractor } from './application/use-cases/tickets/reopen-ticket.interactor.js';
import { UnassignAllTicketsInteractor } from './application/use-cases/tickets/unassign-all-tickets.interactor.js';
import { UnassignTicketInteractor } from './application/use-cases/tickets/unassign-ticket.interactor.js';
import { Clock, SystemClock } from '@/infra/lib/clock.js';

@Module({
  controllers: [BoardsController, TicketsController, BoardStreamController],
  providers: [
    // Infrastructure
    { provide: Clock, useClass: SystemClock },

    // Port → Adapter bindings (write-side)
    { provide: TicketRepository, useClass: DrizzleTicketRepository },
    { provide: BoardRepository, useClass: DrizzleBoardRepository },

    // Port → Adapter bindings (read-side)
    { provide: TicketListQueryPort, useClass: DrizzleTicketQuery },
    { provide: TicketDetailQueryPort, useClass: DrizzleTicketQuery },
    { provide: MyTicketsQueryPort, useClass: DrizzleTicketQuery },
    { provide: BoardListQueryPort, useClass: DrizzleBoardQuery },
    { provide: BoardDetailQueryPort, useClass: DrizzleBoardQuery },
    { provide: MyBoardsQueryPort, useClass: DrizzleBoardQuery },

    // Port → Adapter bindings (services)
    { provide: TicketIdGenerator, useClass: UuidTicketIdGenerator },
    { provide: TicketEventPublisher, useClass: RedisTicketEventPublisher },

    // Realtime infrastructure
    BoardEventsSubscriber,

    // Use cases — Boards
    CreateBoardInteractor,
    UpdateBoardInteractor,
    DeleteBoardInteractor,
    AddSubscriptionInteractor,
    RemoveSubscriptionInteractor,
    AddCloseSubscriptionInteractor,
    RemoveCloseSubscriptionInteractor,
    AddRedirectSubscriptionInteractor,
    RemoveRedirectSubscriptionInteractor,
    AddMemberInteractor,
    RemoveMemberInteractor,
    AddAutomationInteractor,
    RemoveAutomationInteractor,

    // Kafka consumer handler
    TicketTriggerConsumerHandler,

    // Use cases — Tickets
    CreateTicketInteractor,
    HandleTriggerEventInteractor,
    HandleCloseTriggerInteractor,
    AssignTicketInteractor,
    ReassignTicketInteractor,
    UnassignTicketInteractor,
    UnassignAllTicketsInteractor,
    MoveTicketInteractor,
    MarkDoneInteractor,
    ReopenTicketInteractor,
    AddCommentInteractor,

    // Queries
    GetBoardDetailQuery,
    GetBoardsQuery,
    GetTicketsQuery,
    GetTicketDetailQuery,
    GetMyTicketsQuery,
    GetMyBoardsQuery,
    GetTriggersQuery,
    GetFiltersQuery,
    AuthorizeBoardStreamQuery,
  ],
})
export class TicketsModule {}
