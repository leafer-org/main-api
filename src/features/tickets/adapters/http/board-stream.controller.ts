import { Controller, Get, HttpException, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AuthorizeBoardStreamQuery } from '../../application/use-cases/queries/authorize-board-stream.query.js';
import type { TicketRealtimeEvent } from '../../domain/events/realtime-events.js';
import { BoardEventsSubscriber } from '../redis/board-events.subscriber.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { isLeft } from '@/infra/lib/box.js';
import { BoardId } from '@/kernel/domain/ids.js';

const HEARTBEAT_INTERVAL_MS = 15_000;

function throwDomainError(error: { toResponse(): Record<number, unknown> }): never {
  const response = error.toResponse();
  const [statusCode] = Object.keys(response);
  throw new HttpException(
    response[Number(statusCode)] as Record<string, unknown>,
    Number(statusCode),
  );
}

@Controller('admin/boards')
export class BoardStreamController {
  public constructor(
    private readonly authorize: AuthorizeBoardStreamQuery,
    private readonly subscriber: BoardEventsSubscriber,
  ) {}

  @Get(':boardId/stream')
  public async stream(
    @Param('boardId') boardIdRaw: string,
    @CurrentUser() user: JwtUserPayload,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const boardId = BoardId.raw(boardIdRaw);

    const auth = await this.authorize.execute({ boardId, userId: user.userId });
    if (isLeft(auth)) throwDomainError(auth.error);

    const writeEvent = (event: TicketRealtimeEvent): void => {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Подписка должна быть зарегистрирована ДО отправки заголовков клиенту:
    // как только клиент получит 200, он может сразу триггерить действие,
    // и публикация не должна потеряться.
    const unsubscribe = this.subscriber.subscribe(boardId, writeEvent);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const heartbeat = setInterval(() => {
      res.write(': keepalive\n\n');
    }, HEARTBEAT_INTERVAL_MS);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
  }
}
