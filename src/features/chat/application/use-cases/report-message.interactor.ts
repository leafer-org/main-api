import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { CreateDomainError } from '@/infra/ddd/error.js';
import { ChatNotFoundError } from '../../domain/aggregates/chat/errors.js';
import { MessageNotFoundError } from '../../domain/aggregates/message/errors.js';
import { chatReports } from '../../adapters/db/schema.js';
import {
  ChatEventPublisher,
  ChatIdGenerator,
  ChatRepository,
  MessageRepository,
} from '../ports.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ChatId, ChatMessageId, UserId } from '@/kernel/domain/ids.js';

export class CannotReportOwnMessageError extends CreateDomainError(
  'cannot_report_own_message',
  400,
) {}

export class AlreadyReportedError extends CreateDomainError('already_reported', 409) {}

export class ReporterNotInChatError extends CreateDomainError('reporter_not_in_chat', 403) {}

export type ReportCategory = 'spam' | 'abuse' | 'illegal' | 'other';

export type ReportMessageCommand = {
  chatId: ChatId;
  messageId: ChatMessageId;
  reporterUserId: UserId;
  reason: string;
  category: ReportCategory | null;
};

export type ReportChatCommand = {
  chatId: ChatId;
  reporterUserId: UserId;
  reason: string;
  category: ReportCategory | null;
};

type ReportError =
  | ChatNotFoundError
  | MessageNotFoundError
  | ReporterNotInChatError
  | CannotReportOwnMessageError
  | AlreadyReportedError;

@Injectable()
export class ReportMessageInteractor {
  public constructor(
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
    @Inject(MessageRepository) private readonly messageRepo: MessageRepository,
    @Inject(ChatIdGenerator) private readonly idGen: ChatIdGenerator,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(TransactionHostPg) private readonly txHostPg: TransactionHostPg,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ChatEventPublisher) private readonly publisher: ChatEventPublisher,
  ) {}

  public async execute(cmd: ReportMessageCommand): Promise<Either<ReportError, void>> {
    return this.txHost.startTransaction(async (tx) => {
      const chat = await this.chatRepo.findById(tx, cmd.chatId);
      if (!chat) return Left(new ChatNotFoundError());

      const reporterParticipant = chat.participants.find((p) => {
        if (p.kind === 'user') return (p.subjectId ?? '') === (cmd.reporterUserId as string);
        return p.assignedUserId !== null && (p.assignedUserId as string) === (cmd.reporterUserId as string);
      });
      if (!reporterParticipant) return Left(new ReporterNotInChatError());

      const msg = await this.messageRepo.findById(tx, cmd.messageId);
      if (!msg || (msg.chatId as string) !== (cmd.chatId as string)) {
        return Left(new MessageNotFoundError());
      }

      if (msg.actorUserId !== null && (msg.actorUserId as string) === (cmd.reporterUserId as string)) {
        return Left(new CannotReportOwnMessageError());
      }

      const db = this.txHostPg.get(tx);
      const existing = await db
        .select({ id: chatReports.id })
        .from(chatReports)
        .where(
          and(
            eq(chatReports.messageId, cmd.messageId as string),
            eq(chatReports.reporterUserId, cmd.reporterUserId as string),
          ),
        )
        .limit(1);
      if (existing.length > 0) return Left(new AlreadyReportedError());

      await db.insert(chatReports).values({
        id: this.idGen.generateMessageId() as string, // reuse uuid generator
        chatId: cmd.chatId as string,
        messageId: cmd.messageId as string,
        reporterUserId: cmd.reporterUserId as string,
        reporterParticipantId: reporterParticipant.id as string,
        category: cmd.category,
        reason: cmd.reason,
        createdAt: this.clock.now(),
      });

      await this.publisher.publish(tx, {
        type: 'chat.message.sent',
        chatId: cmd.chatId,
        messageId: cmd.messageId,
        senderParticipantId: null,
        actorUserId: null,
        kind: 'system',
        text: null,
        mediaIds: [],
        attachments: [],
        systemEvent: null,
        createdAt: this.clock.now(),
      });

      return Right(undefined);
    });
  }
}

@Injectable()
export class ReportChatInteractor {
  public constructor(
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
    @Inject(ChatIdGenerator) private readonly idGen: ChatIdGenerator,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(TransactionHostPg) private readonly txHostPg: TransactionHostPg,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(cmd: ReportChatCommand): Promise<Either<ReportError, void>> {
    return this.txHost.startTransaction(async (tx) => {
      const chat = await this.chatRepo.findById(tx, cmd.chatId);
      if (!chat) return Left(new ChatNotFoundError());

      const reporterParticipant = chat.participants.find((p) => {
        if (p.kind === 'user') return (p.subjectId ?? '') === (cmd.reporterUserId as string);
        return p.assignedUserId !== null && (p.assignedUserId as string) === (cmd.reporterUserId as string);
      });
      if (!reporterParticipant) return Left(new ReporterNotInChatError());

      const db = this.txHostPg.get(tx);
      await db.insert(chatReports).values({
        id: this.idGen.generateMessageId() as string,
        chatId: cmd.chatId as string,
        messageId: null,
        reporterUserId: cmd.reporterUserId as string,
        reporterParticipantId: reporterParticipant.id as string,
        category: cmd.category,
        reason: cmd.reason,
        createdAt: this.clock.now(),
      });
      return Right(undefined);
    });
  }
}
