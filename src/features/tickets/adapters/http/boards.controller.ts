import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { AddAutomationInteractor } from '../../application/use-cases/boards/add-automation.interactor.js';
import { AddCloseSubscriptionInteractor } from '../../application/use-cases/boards/add-close-subscription.interactor.js';
import { AddMemberInteractor } from '../../application/use-cases/boards/add-member.interactor.js';
import { AddRedirectSubscriptionInteractor } from '../../application/use-cases/boards/add-redirect-subscription.interactor.js';
import { AddSubscriptionInteractor } from '../../application/use-cases/boards/add-subscription.interactor.js';
import { CreateBoardInteractor } from '../../application/use-cases/boards/create-board.interactor.js';
import { DeleteBoardInteractor } from '../../application/use-cases/boards/delete-board.interactor.js';
import { RemoveAutomationInteractor } from '../../application/use-cases/boards/remove-automation.interactor.js';
import { RemoveCloseSubscriptionInteractor } from '../../application/use-cases/boards/remove-close-subscription.interactor.js';
import { RemoveMemberInteractor } from '../../application/use-cases/boards/remove-member.interactor.js';
import { RemoveRedirectSubscriptionInteractor } from '../../application/use-cases/boards/remove-redirect-subscription.interactor.js';
import { RemoveSubscriptionInteractor } from '../../application/use-cases/boards/remove-subscription.interactor.js';
import { UpdateBoardInteractor } from '../../application/use-cases/boards/update-board.interactor.js';
import { GetBoardDetailQuery } from '../../application/use-cases/queries/get-board-detail.query.js';
import { GetBoardsQuery } from '../../application/use-cases/queries/get-boards.query.js';
import { GetFiltersQuery } from '../../application/use-cases/queries/get-filters.query.js';
import { GetMyBoardsQuery } from '../../application/use-cases/queries/get-my-boards.query.js';
import { GetTriggersQuery } from '../../application/use-cases/queries/get-triggers.query.js';
import { InvalidTriggerIdError } from '../../domain/aggregates/board/errors.js';
import { TriggerId } from '../../domain/vo/triggers.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
import type { PublicBody, PublicQuery, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft, Left } from '@/infra/lib/box.js';
import {
  BoardAutomationId,
  BoardCloseSubscriptionId,
  BoardId,
  BoardRedirectSubscriptionId,
  BoardSubscriptionId,
  OrganizationId,
  UserId,
} from '@/kernel/domain/ids.js';

function parseTriggerId(value: string) {
  const parsed = TriggerId.parse(value);
  if (!parsed) return Left(new InvalidTriggerIdError());
  return { type: 'success' as const, value: parsed };
}

@Controller('admin/boards')
export class BoardsController {
  public constructor(
    private readonly createBoard: CreateBoardInteractor,
    private readonly updateBoard: UpdateBoardInteractor,
    private readonly deleteBoard: DeleteBoardInteractor,
    private readonly addSubscription: AddSubscriptionInteractor,
    private readonly removeSubscription: RemoveSubscriptionInteractor,
    private readonly addCloseSubscription: AddCloseSubscriptionInteractor,
    private readonly removeCloseSubscription: RemoveCloseSubscriptionInteractor,
    private readonly addRedirectSubscription: AddRedirectSubscriptionInteractor,
    private readonly removeRedirectSubscription: RemoveRedirectSubscriptionInteractor,
    private readonly addMember: AddMemberInteractor,
    private readonly removeMember: RemoveMemberInteractor,
    private readonly addAutomation: AddAutomationInteractor,
    private readonly removeAutomation: RemoveAutomationInteractor,
    private readonly getBoardDetailQuery: GetBoardDetailQuery,
    private readonly getBoardsQuery: GetBoardsQuery,
    private readonly getMyBoardsQuery: GetMyBoardsQuery,
    private readonly getTriggersQuery: GetTriggersQuery,
    private readonly getFiltersQuery: GetFiltersQuery,
  ) {}

  @Get()
  public async list(
    @Query('scope') scope?: PublicQuery['getAdminBoards']['scope'],
  ): Promise<PublicResponse['getAdminBoards']> {
    const result = await this.getBoardsQuery.execute({ scope });
    if (isLeft(result)) throw domainToHttpError<'getAdminBoards'>(result.error.toResponse());

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
  public async getTriggers(
    @Query('category') category?: PublicQuery['getAdminTicketTriggers']['category'],
  ): Promise<PublicResponse['getAdminTicketTriggers']> {
    const result = await this.getTriggersQuery.execute({ category });
    if (isLeft(result)) throw domainToHttpError<'getAdminTicketTriggers'>(result.error.toResponse());
    return result.value;
  }

  @Get('filters')
  public async getFilters(
    @Query('category') category?: PublicQuery['getAdminTicketFilters']['category'],
  ): Promise<PublicResponse['getAdminTicketFilters']> {
    const result = await this.getFiltersQuery.execute({ category });
    if (isLeft(result)) throw domainToHttpError<'getAdminTicketFilters'>(result.error.toResponse());
    return result.value;
  }

  @Get('my')
  public async myBoards(
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['getAdminMyBoards']> {
    const result = await this.getMyBoardsQuery.execute({ userId: user.userId });
    if (isLeft(result)) throw domainToHttpError<'getAdminMyBoards'>(result.error.toResponse());

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

  @Get(':boardId')
  public async detail(@Param('boardId') boardId: string): Promise<PublicResponse['getAdminBoardDetail']> {
    const result = await this.getBoardDetailQuery.execute({ boardId: BoardId.raw(boardId) });
    if (isLeft(result)) throw domainToHttpError<'getAdminBoardDetail'>(result.error.toResponse());

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
      members: state.members,
      subscriptions: state.subscriptions,
      closeSubscriptions: state.closeSubscriptions,
      redirectSubscriptions: state.redirectSubscriptions,
      automations: state.automations,
      createdAt: state.createdAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
    };
  }

  @Post()
  public async create(
    @Body() body: PublicBody['createAdminBoard'],
  ): Promise<PublicResponse['createAdminBoard']> {
    const result = await this.createBoard.execute({
      name: body.name,
      description: body.description ?? null,
      scope: body.scope,
      organizationId: body.organizationId ? OrganizationId.raw(body.organizationId) : null,
      manualCreation: body.manualCreation,
    });
    if (isLeft(result)) throw domainToHttpError<'createAdminBoard'>(result.error.toResponse());

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
      closeSubscriptions: state.closeSubscriptions,
      redirectSubscriptions: state.redirectSubscriptions,
      automations: state.automations,
      createdAt: state.createdAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
    };
  }

  @Patch(':boardId')
  public async update(
    @Param('boardId') boardId: string,
    @Body() body: PublicBody['updateAdminBoard'],
  ): Promise<PublicResponse['updateAdminBoard']> {
    const result = await this.updateBoard.execute({
      boardId: BoardId.raw(boardId),
      name: body.name,
      description: body.description ?? null,
      manualCreation: body.manualCreation,
      allowedTransferBoardIds: body.allowedTransferBoardIds.map((id) => BoardId.raw(id)),
    });
    if (isLeft(result)) throw domainToHttpError<'updateAdminBoard'>(result.error.toResponse());

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
      closeSubscriptions: state.closeSubscriptions,
      redirectSubscriptions: state.redirectSubscriptions,
      automations: state.automations,
      createdAt: state.createdAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
    };
  }

  @Delete(':boardId')
  @HttpCode(204)
  public async remove(@Param('boardId') boardId: string): Promise<void> {
    const result = await this.deleteBoard.execute({ boardId: BoardId.raw(boardId) });
    if (isLeft(result)) throw domainToHttpError<'deleteAdminBoard'>(result.error.toResponse());
  }

  // --- Open subscriptions ---

  @Post(':boardId/subscriptions')
  public async addSub(
    @Param('boardId') boardId: string,
    @Body() body: PublicBody['addAdminBoardSubscription'],
  ): Promise<PublicResponse['addAdminBoardSubscription']> {
    const trigger = parseTriggerId(body.triggerId);
    if (isLeft(trigger)) throw domainToHttpError<'addAdminBoardSubscription'>(trigger.error.toResponse());

    const result = await this.addSubscription.execute({
      boardId: BoardId.raw(boardId),
      triggerId: trigger.value,
      filters: body.filters,
    });
    if (isLeft(result)) throw domainToHttpError<'addAdminBoardSubscription'>(result.error.toResponse());
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
    if (isLeft(result)) throw domainToHttpError<'removeAdminBoardSubscription'>(result.error.toResponse());
  }

  // --- Close subscriptions ---

  @Post(':boardId/close-subscriptions')
  public async addCloseSub(
    @Param('boardId') boardId: string,
    @Body() body: PublicBody['addAdminBoardCloseSubscription'],
  ): Promise<PublicResponse['addAdminBoardCloseSubscription']> {
    const trigger = parseTriggerId(body.triggerId);
    if (isLeft(trigger)) throw domainToHttpError<'addAdminBoardCloseSubscription'>(trigger.error.toResponse());

    const result = await this.addCloseSubscription.execute({
      boardId: BoardId.raw(boardId),
      triggerId: trigger.value,
      filters: body.filters,
      addComment: body.addComment,
    });
    if (isLeft(result)) throw domainToHttpError<'addAdminBoardCloseSubscription'>(result.error.toResponse());
    return { boardId: result.value.boardId, closeSubscriptions: result.value.closeSubscriptions };
  }

  @Delete(':boardId/close-subscriptions/:subId')
  @HttpCode(204)
  public async removeCloseSub(
    @Param('boardId') boardId: string,
    @Param('subId') subId: string,
  ): Promise<void> {
    const result = await this.removeCloseSubscription.execute({
      boardId: BoardId.raw(boardId),
      subscriptionId: BoardCloseSubscriptionId.raw(subId),
    });
    if (isLeft(result)) throw domainToHttpError<'removeAdminBoardCloseSubscription'>(result.error.toResponse());
  }

  // --- Redirect subscriptions ---

  @Post(':boardId/redirect-subscriptions')
  public async addRedirectSub(
    @Param('boardId') boardId: string,
    @Body() body: PublicBody['addAdminBoardRedirectSubscription'],
  ): Promise<PublicResponse['addAdminBoardRedirectSubscription']> {
    const trigger = parseTriggerId(body.triggerId);
    if (isLeft(trigger)) throw domainToHttpError<'addAdminBoardRedirectSubscription'>(trigger.error.toResponse());

    const result = await this.addRedirectSubscription.execute({
      boardId: BoardId.raw(boardId),
      triggerId: trigger.value,
      filters: body.filters,
      targetBoardId: BoardId.raw(body.targetBoardId),
      addComment: body.addComment,
      commentTemplate: body.commentTemplate,
    });
    if (isLeft(result)) throw domainToHttpError<'addAdminBoardRedirectSubscription'>(result.error.toResponse());
    return { boardId: result.value.boardId, redirectSubscriptions: result.value.redirectSubscriptions };
  }

  @Delete(':boardId/redirect-subscriptions/:subId')
  @HttpCode(204)
  public async removeRedirectSub(
    @Param('boardId') boardId: string,
    @Param('subId') subId: string,
  ): Promise<void> {
    const result = await this.removeRedirectSubscription.execute({
      boardId: BoardId.raw(boardId),
      subscriptionId: BoardRedirectSubscriptionId.raw(subId),
    });
    if (isLeft(result)) throw domainToHttpError<'removeAdminBoardRedirectSubscription'>(result.error.toResponse());
  }

  // --- Members ---

  @Post(':boardId/members')
  public async addBoardMember(
    @Param('boardId') boardId: string,
    @Body() body: PublicBody['addAdminBoardMember'],
  ): Promise<PublicResponse['addAdminBoardMember']> {
    const result = await this.addMember.execute({
      boardId: BoardId.raw(boardId),
      phone: body.phone,
    });
    if (isLeft(result)) throw domainToHttpError<'addAdminBoardMember'>(result.error.toResponse());
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
    if (isLeft(result)) throw domainToHttpError<'removeAdminBoardMember'>(result.error.toResponse());
  }

  // --- Automations ---

  @Put(':boardId/automation')
  public async addBoardAutomation(
    @Param('boardId') boardId: string,
    @Body() body: PublicBody['addAdminBoardAutomation'],
  ): Promise<PublicResponse['addAdminBoardAutomation']> {
    const result = await this.addAutomation.execute({
      boardId: BoardId.raw(boardId),
      agentId: body.agentId,
      systemPrompt: body.systemPrompt,
      onUncertainMoveToBoardId: body.onUncertainMoveToBoardId
        ? BoardId.raw(body.onUncertainMoveToBoardId)
        : null,
    });
    if (isLeft(result)) throw domainToHttpError<'addAdminBoardAutomation'>(result.error.toResponse());
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
    if (isLeft(result)) throw domainToHttpError<'removeAdminBoardAutomation'>(result.error.toResponse());
  }
}
