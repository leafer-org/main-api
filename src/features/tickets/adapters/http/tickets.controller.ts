import { Body, Controller, Get, HttpCode, HttpException, Param, Post, Query } from '@nestjs/common';

import { GetMyTicketsQuery } from '../../application/use-cases/queries/get-my-tickets.query.js';
import { GetTicketDetailQuery } from '../../application/use-cases/queries/get-ticket-detail.query.js';
import { GetTicketsQuery } from '../../application/use-cases/queries/get-tickets.query.js';
import { AddCommentInteractor } from '../../application/use-cases/tickets/add-comment.interactor.js';
import { AssignTicketInteractor } from '../../application/use-cases/tickets/assign-ticket.interactor.js';
import { CreateTicketInteractor } from '../../application/use-cases/tickets/create-ticket.interactor.js';
import { MarkDoneInteractor } from '../../application/use-cases/tickets/mark-done.interactor.js';
import { MoveTicketInteractor } from '../../application/use-cases/tickets/move-ticket.interactor.js';
import { ReassignTicketInteractor } from '../../application/use-cases/tickets/reassign-ticket.interactor.js';
import { ReopenTicketInteractor } from '../../application/use-cases/tickets/reopen-ticket.interactor.js';
import { UnassignTicketInteractor } from '../../application/use-cases/tickets/unassign-ticket.interactor.js';
import type { TicketStatus } from '../../domain/aggregates/ticket/state.js';
import type { TicketData } from '../../domain/vo/ticket-data.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { isLeft } from '@/infra/lib/box.js';
import { BoardId, TicketId, UserId } from '@/kernel/domain/ids.js';

function throwDomainError(error: { toResponse(): Record<number, unknown> }): never {
  const response = error.toResponse();
  const [statusCode] = Object.keys(response);
  throw new HttpException(
    response[Number(statusCode)] as Record<string, unknown>,
    Number(statusCode),
  );
}

@Controller('admin/tickets')
export class TicketsController {
  public constructor(
    private readonly createTicket: CreateTicketInteractor,
    private readonly assignTicket: AssignTicketInteractor,
    private readonly reassignTicket: ReassignTicketInteractor,
    private readonly unassignTicket: UnassignTicketInteractor,
    private readonly moveTicket: MoveTicketInteractor,
    private readonly markDone: MarkDoneInteractor,
    private readonly reopenTicket: ReopenTicketInteractor,
    private readonly addComment: AddCommentInteractor,
    private readonly getTicketsQuery: GetTicketsQuery,
    private readonly getMyTicketsQuery: GetMyTicketsQuery,
    private readonly getTicketDetailQuery: GetTicketDetailQuery,
  ) {}

  @Get()
  public async list(
    @Query('boardId') boardId?: string,
    @Query('status') status?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('from') from?: string,
    @Query('size') size?: string,
  ) {
    const result = await this.getTicketsQuery.execute({
      boardId: boardId ? BoardId.raw(boardId) : undefined,
      status: status as TicketStatus | undefined,
      assigneeId: assigneeId ? UserId.raw(assigneeId) : undefined,
      from: from ? Number(from) : undefined,
      size: size ? Number(size) : undefined,
    });

    if (isLeft(result)) throwDomainError(result.error);

    return {
      tickets: result.value.tickets.map(this.toTicketListResponse),
      total: result.value.total,
    };
  }

  @Get('my')
  public async myTickets(
    @CurrentUser() user: JwtUserPayload,
    @Query('from') from?: string,
    @Query('size') size?: string,
  ) {
    const result = await this.getMyTicketsQuery.execute({
      userId: user.userId,
      from: from ? Number(from) : undefined,
      size: size ? Number(size) : undefined,
    });

    if (isLeft(result)) throwDomainError(result.error);

    return {
      tickets: result.value.tickets.map(this.toTicketListResponse),
      total: result.value.total,
    };
  }

  @Get(':ticketId')
  public async detail(@Param('ticketId') ticketId: string) {
    const result = await this.getTicketDetailQuery.execute({
      ticketId: TicketId.raw(ticketId),
    });

    if (isLeft(result)) throwDomainError(result.error);

    const ticket = result.value;

    return {
      ticketId: ticket.ticketId,
      boardId: ticket.boardId,
      message: ticket.message,
      data: ticket.data,
      triggerId: ticket.triggerId,
      eventId: ticket.eventId,
      status: ticket.status,
      assigneeId: ticket.assigneeId,
      history: ticket.history.map((entry) => ({
        action: entry.action,
        actorId: entry.actorId,
        data: entry.data,
        timestamp: entry.timestamp.toISOString(),
      })),
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    };
  }

  @Post()
  public async create(
    @Body() body: { boardId: string; message: string; data: TicketData },
    @CurrentUser() user: JwtUserPayload,
  ) {
    const result = await this.createTicket.execute({
      boardId: BoardId.raw(body.boardId),
      message: body.message,
      data: body.data,
      createdBy: user.userId,
    });

    if (isLeft(result)) throwDomainError(result.error);

    const ticket = result.value;

    return {
      ticketId: ticket.ticketId,
      boardId: ticket.boardId,
      message: ticket.message,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
    };
  }

  @Post(':ticketId/assign')
  @HttpCode(200)
  public async assign(@Param('ticketId') ticketId: string, @Body() body: { assigneeId: string }) {
    const result = await this.assignTicket.execute({
      ticketId: TicketId.raw(ticketId),
      assigneeId: UserId.raw(body.assigneeId),
    });

    if (isLeft(result)) throwDomainError(result.error);

    return {
      ticketId: result.value.ticketId,
      status: result.value.status,
      assigneeId: result.value.assigneeId,
    };
  }

  @Post(':ticketId/reassign')
  @HttpCode(200)
  public async reassign(
    @Param('ticketId') ticketId: string,
    @Body() body: { assigneeId: string },
    @CurrentUser() user: JwtUserPayload,
  ) {
    const result = await this.reassignTicket.execute({
      ticketId: TicketId.raw(ticketId),
      assigneeId: UserId.raw(body.assigneeId),
      reassignedBy: user.userId,
    });

    if (isLeft(result)) throwDomainError(result.error);

    return {
      ticketId: result.value.ticketId,
      status: result.value.status,
      assigneeId: result.value.assigneeId,
    };
  }

  @Post(':ticketId/unassign')
  @HttpCode(204)
  public async unassign(@Param('ticketId') ticketId: string): Promise<void> {
    const result = await this.unassignTicket.execute({
      ticketId: TicketId.raw(ticketId),
    });

    if (isLeft(result)) throwDomainError(result.error);
  }

  @Post(':ticketId/move')
  @HttpCode(200)
  public async move(
    @Param('ticketId') ticketId: string,
    @Body() body: { toBoardId: string; comment: string },
    @CurrentUser() user: JwtUserPayload,
  ) {
    const result = await this.moveTicket.execute({
      ticketId: TicketId.raw(ticketId),
      toBoardId: BoardId.raw(body.toBoardId),
      movedBy: user.userId,
      comment: body.comment,
    });

    if (isLeft(result)) throwDomainError(result.error);

    return {
      ticketId: result.value.ticketId,
      boardId: result.value.boardId,
      status: result.value.status,
    };
  }

  @Post(':ticketId/done')
  @HttpCode(204)
  public async done(@Param('ticketId') ticketId: string): Promise<void> {
    const result = await this.markDone.execute({
      ticketId: TicketId.raw(ticketId),
    });

    if (isLeft(result)) throwDomainError(result.error);
  }

  @Post(':ticketId/reopen')
  @HttpCode(204)
  public async reopen(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.reopenTicket.execute({
      ticketId: TicketId.raw(ticketId),
      reopenedBy: user.userId,
    });

    if (isLeft(result)) throwDomainError(result.error);
  }

  @Post(':ticketId/comments')
  @HttpCode(200)
  public async addTicketComment(
    @Param('ticketId') ticketId: string,
    @Body() body: { text: string },
    @CurrentUser() user: JwtUserPayload,
  ) {
    const result = await this.addComment.execute({
      ticketId: TicketId.raw(ticketId),
      authorId: user.userId,
      text: body.text,
    });

    if (isLeft(result)) throwDomainError(result.error);

    return { ticketId: result.value.ticketId, status: result.value.status };
  }

  private toTicketListResponse(ticket: {
    ticketId: unknown;
    boardId: unknown;
    message: string;
    triggerId: unknown;
    status: string;
    assigneeId: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ticketId: ticket.ticketId,
      boardId: ticket.boardId,
      message: ticket.message,
      triggerId: ticket.triggerId,
      status: ticket.status,
      assigneeId: ticket.assigneeId,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    };
  }
}
