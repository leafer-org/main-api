import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { AddAutomationInteractor } from '../../application/use-cases/boards/add-automation.interactor.js';
import { AddMemberInteractor } from '../../application/use-cases/boards/add-member.interactor.js';
import { AddSubscriptionInteractor } from '../../application/use-cases/boards/add-subscription.interactor.js';
import { CreateBoardInteractor } from '../../application/use-cases/boards/create-board.interactor.js';
import { DeleteBoardInteractor } from '../../application/use-cases/boards/delete-board.interactor.js';
import { RemoveAutomationInteractor } from '../../application/use-cases/boards/remove-automation.interactor.js';
import { RemoveMemberInteractor } from '../../application/use-cases/boards/remove-member.interactor.js';
import { RemoveSubscriptionInteractor } from '../../application/use-cases/boards/remove-subscription.interactor.js';
import { UpdateBoardInteractor } from '../../application/use-cases/boards/update-board.interactor.js';
import { GetBoardDetailQuery } from '../../application/use-cases/queries/get-board-detail.query.js';
import { GetBoardsQuery } from '../../application/use-cases/queries/get-boards.query.js';
import { GetTriggersQuery } from '../../application/use-cases/queries/get-triggers.query.js';
import type { BoardScope, CloseTrigger } from '../../domain/aggregates/board/state.js';
import type { SubscriptionFilter } from '../../domain/vo/filters.js';
import type { TriggerId, TriggerScope } from '../../domain/vo/triggers.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { isLeft } from '@/infra/lib/box.js';
import {
  BoardAutomationId,
  BoardId,
  BoardSubscriptionId,
  OrganizationId,
  UserId,
} from '@/kernel/domain/ids.js';

function throwDomainError(error: { toResponse(): Record<number, unknown> }): never {
  const response = error.toResponse();
  const [statusCode] = Object.keys(response);
  throw new HttpException(
    response[Number(statusCode)] as Record<string, unknown>,
    Number(statusCode),
  );
}

@Controller('admin/boards')
export class BoardsController {
  public constructor(
    private readonly createBoard: CreateBoardInteractor,
    private readonly updateBoard: UpdateBoardInteractor,
    private readonly deleteBoard: DeleteBoardInteractor,
    private readonly addSubscription: AddSubscriptionInteractor,
    private readonly removeSubscription: RemoveSubscriptionInteractor,
    private readonly addMember: AddMemberInteractor,
    private readonly removeMember: RemoveMemberInteractor,
    private readonly addAutomation: AddAutomationInteractor,
    private readonly removeAutomation: RemoveAutomationInteractor,
    private readonly getBoardDetailQuery: GetBoardDetailQuery,
    private readonly getBoardsQuery: GetBoardsQuery,
    private readonly getTriggersQuery: GetTriggersQuery,
  ) {}

  @Get()
  public async list(@Query('scope') scope?: string) {
    const result = await this.getBoardsQuery.execute({
      scope: scope as BoardScope | undefined,
    });

    if (isLeft(result)) throwDomainError(result.error);

    return result.value.map((board) => ({
      boardId: board.boardId,
      name: board.name,
      description: board.description,
      scope: board.scope,
      manualCreation: board.manualCreation,
      subscriptionCount: board.subscriptionCount,
      memberCount: board.memberCount,
      automationCount: board.automationCount,
      createdAt: board.createdAt.toISOString(),
    }));
  }

  @Get('triggers')
  public async getTriggers(@Query('scope') scope?: string) {
    const result = await this.getTriggersQuery.execute({
      scope: scope as TriggerScope | undefined,
    });

    if (isLeft(result)) throwDomainError(result.error);

    return result.value;
  }

  @Get(':boardId')
  public async detail(@Param('boardId') boardId: string) {
    const result = await this.getBoardDetailQuery.execute({
      boardId: BoardId.raw(boardId),
    });

    if (isLeft(result)) throwDomainError(result.error);

    const state = result.value;

    return {
      boardId: state.boardId,
      name: state.name,
      description: state.description,
      scope: state.scope,
      organizationId: state.organizationId,
      manualCreation: state.manualCreation,
      allowedTransferBoardIds: state.allowedTransferBoardIds,
      memberIds: state.memberIds,
      subscriptions: state.subscriptions,
      automations: state.automations,
      closeTrigger: state.closeTrigger,
      createdAt: state.createdAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
    };
  }

  @Post()
  public async create(
    @Body()
    body: {
      name: string;
      description: string | null;
      scope: BoardScope;
      organizationId: string | null;
      manualCreation: boolean;
    },
  ) {
    const result = await this.createBoard.execute({
      name: body.name,
      description: body.description,
      scope: body.scope,
      organizationId: body.organizationId ? OrganizationId.raw(body.organizationId) : null,
      manualCreation: body.manualCreation,
    });

    if (isLeft(result)) throwDomainError(result.error);

    const state = result.value;

    return {
      boardId: state.boardId,
      name: state.name,
      description: state.description,
      scope: state.scope,
      organizationId: state.organizationId,
      manualCreation: state.manualCreation,
      allowedTransferBoardIds: state.allowedTransferBoardIds,
      memberIds: state.memberIds,
      subscriptions: state.subscriptions,
      automations: state.automations,
      closeTrigger: state.closeTrigger,
      createdAt: state.createdAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
    };
  }

  @Patch(':boardId')
  public async update(
    @Param('boardId') boardId: string,
    @Body()
    body: {
      name: string;
      description: string | null;
      manualCreation: boolean;
      allowedTransferBoardIds: string[];
      closeTrigger: CloseTrigger | null;
    },
  ) {
    const result = await this.updateBoard.execute({
      boardId: BoardId.raw(boardId),
      name: body.name,
      description: body.description,
      manualCreation: body.manualCreation,
      allowedTransferBoardIds: body.allowedTransferBoardIds.map((id) => BoardId.raw(id)),
      closeTrigger: body.closeTrigger ?? null,
    });

    if (isLeft(result)) throwDomainError(result.error);

    const state = result.value;

    return {
      boardId: state.boardId,
      name: state.name,
      description: state.description,
      scope: state.scope,
      organizationId: state.organizationId,
      manualCreation: state.manualCreation,
      allowedTransferBoardIds: state.allowedTransferBoardIds,
      memberIds: state.memberIds,
      subscriptions: state.subscriptions,
      automations: state.automations,
      closeTrigger: state.closeTrigger,
      createdAt: state.createdAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
    };
  }

  @Delete(':boardId')
  @HttpCode(204)
  public async remove(@Param('boardId') boardId: string): Promise<void> {
    const result = await this.deleteBoard.execute({
      boardId: BoardId.raw(boardId),
    });

    if (isLeft(result)) throwDomainError(result.error);
  }

  @Post(':boardId/subscriptions')
  public async addSub(
    @Param('boardId') boardId: string,
    @Body() body: { triggerId: string; filters: SubscriptionFilter[] },
  ) {
    const result = await this.addSubscription.execute({
      boardId: BoardId.raw(boardId),
      triggerId: body.triggerId as TriggerId,
      filters: body.filters,
    });

    if (isLeft(result)) throwDomainError(result.error);

    return { boardId: result.value.boardId, subscriptions: result.value.subscriptions };
  }

  @Delete(':boardId/subscriptions/:subId')
  @HttpCode(204)
  public async removeSub(
    @Param('boardId') boardId: string,
    @Param('subId') subId: string,
  ): Promise<void> {
    const result = await this.removeSubscription.execute({
      boardId: BoardId.raw(boardId),
      subscriptionId: BoardSubscriptionId.raw(subId),
    });

    if (isLeft(result)) throwDomainError(result.error);
  }

  @Post(':boardId/members')
  public async addBoardMember(@Param('boardId') boardId: string, @Body() body: { userId: string }) {
    const result = await this.addMember.execute({
      boardId: BoardId.raw(boardId),
      userId: UserId.raw(body.userId),
    });

    if (isLeft(result)) throwDomainError(result.error);

    return { boardId: result.value.boardId, memberIds: result.value.memberIds };
  }

  @Delete(':boardId/members/:userId')
  @HttpCode(204)
  public async removeBoardMember(
    @Param('boardId') boardId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    const result = await this.removeMember.execute({
      boardId: BoardId.raw(boardId),
      userId: UserId.raw(userId),
    });

    if (isLeft(result)) throwDomainError(result.error);
  }

  @Put(':boardId/automation')
  public async addBoardAutomation(
    @Param('boardId') boardId: string,
    @Body()
    body: {
      agentId: string;
      systemPrompt: string;
      onUncertainMoveToBoardId: string | null;
    },
  ) {
    const result = await this.addAutomation.execute({
      boardId: BoardId.raw(boardId),
      agentId: body.agentId,
      systemPrompt: body.systemPrompt,
      onUncertainMoveToBoardId: body.onUncertainMoveToBoardId
        ? BoardId.raw(body.onUncertainMoveToBoardId)
        : null,
    });

    if (isLeft(result)) throwDomainError(result.error);

    return { boardId: result.value.boardId, automations: result.value.automations };
  }

  @Delete(':boardId/automation/:automationId')
  @HttpCode(204)
  public async removeBoardAutomation(
    @Param('boardId') boardId: string,
    @Param('automationId') automationId: string,
  ): Promise<void> {
    const result = await this.removeAutomation.execute({
      boardId: BoardId.raw(boardId),
      automationId: BoardAutomationId.raw(automationId),
    });

    if (isLeft(result)) throwDomainError(result.error);
  }
}
