import { describe, expect, it, vi } from 'vitest';

import type { ChatEvent } from '../../domain/aggregates/chat/events.js';
import type { ChatState } from '../../domain/aggregates/chat/state.js';
import type { MessageEvent } from '../../domain/aggregates/message/events.js';
import type { MessageState } from '../../domain/aggregates/message/state.js';
import { OpenChatWithOrganizationInteractor } from './open-chat-with-organization.interactor.js';
import { isLeft, isRight, Right } from '@/infra/lib/box.js';
import type { Clock } from '@/infra/lib/clock.js';
import type { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import type { Transaction, TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import {
  ChatId,
  ChatMessageId,
  ChatParticipantId,
  type MediaId,
  OrganizationId,
  UserId,
} from '@/kernel/domain/ids.js';

const USER = UserId.raw('u-1');
const ORG = OrganizationId.raw('o-1');
const CHAT = ChatId.raw('chat-1');
const PA = ChatParticipantId.raw('pa');
const PB = ChatParticipantId.raw('pb');
const MSG = ChatMessageId.raw('msg-1');
const NOW = new Date('2026-05-01T10:00:00.000Z');
const LATER = new Date('2026-05-01T11:00:00.000Z');

type Stubs = ReturnType<typeof makeStubs>;

function makeStubs() {
  const chatRepo = {
    findById:
      vi.fn<(tx: Transaction, chatId: ChatId) => Promise<ChatState | null>>().mockResolvedValue(null),
    findByPairKey:
      vi.fn<(tx: Transaction, pairKey: string) => Promise<ChatState | null>>().mockResolvedValue(null),
    save: vi
      .fn<(tx: Transaction, state: ChatState, pairKey: string) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
  const messageRepo = {
    findById:
      vi.fn<(tx: Transaction, id: ChatMessageId) => Promise<MessageState | null>>().mockResolvedValue(null),
    save: vi.fn<(tx: Transaction, state: MessageState) => Promise<void>>().mockResolvedValue(undefined),
  };
  const idGen = (() => {
    const ids = [PA, PB] as ChatParticipantId[];
    let i = 0;
    return {
      generateChatId: vi.fn<() => ChatId>().mockReturnValue(CHAT),
      generateParticipantId: vi.fn<() => ChatParticipantId>().mockImplementation(() => {
        const next = ids[i] ?? (`p-extra-${i}` as ChatParticipantId);
        i += 1;
        return next;
      }),
      generateMessageId: vi.fn<() => ChatMessageId>().mockReturnValue(MSG),
    };
  })();
  const respondability = {
    exists: vi
      .fn<(orgId: OrganizationId) => Promise<boolean>>()
      .mockResolvedValue(true),
    canRespondAsOrganization: vi
      .fn<(orgId: OrganizationId, userId: UserId) => Promise<boolean>>()
      .mockResolvedValue(false),
    findRespondableUserIds: vi
      .fn<(orgId: OrganizationId) => Promise<UserId[]>>()
      .mockResolvedValue([]),
  };
  const txHost: TransactionHost = {
    startTransaction: async (cb) => cb(NO_TRANSACTION),
  };
  const clock: Clock = {
    now: vi.fn<() => Date>().mockReturnValue(NOW),
  };
  const permissionCheck: PermissionCheckService = {
    can: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    mustCan: vi.fn().mockResolvedValue(Right(undefined as never)),
  };
  const publisher = {
    publish: vi
      .fn<(tx: Transaction, event: ChatEvent | MessageEvent) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
  return { chatRepo, messageRepo, idGen, respondability, txHost, clock, permissionCheck, publisher };
}

function makeInteractor(stubs: Stubs) {
  return new OpenChatWithOrganizationInteractor(
    stubs.chatRepo,
    stubs.messageRepo,
    stubs.idGen,
    stubs.respondability,
    stubs.txHost,
    stubs.clock,
    stubs.publisher,
  );
}

const okMessage = { text: 'Hello', mediaIds: [] as readonly MediaId[] };

describe('OpenChatWithOrganizationInteractor', () => {
  it('opens new chat: persists chat + first message and publishes 2 events', async () => {
    const stubs = makeStubs();
    const interactor = makeInteractor(stubs);

    const result = await interactor.execute({
      initiatorUserId: USER,
      organizationId: ORG,
      contextItemId: null,
      message: okMessage,
    });

    expect(isRight(result)).toBe(true);
    if (!isRight(result)) return;
    expect(result.value.chatId).toBe(CHAT);
    expect(result.value.reused).toBe(false);

    expect(stubs.chatRepo.save).toHaveBeenCalledTimes(1);
    expect(stubs.messageRepo.save).toHaveBeenCalledTimes(1);
    expect(stubs.publisher.publish).toHaveBeenCalledTimes(2);

    const [, savedChat, savedPairKey] = stubs.chatRepo.save.mock.calls[0] ?? [];
    if (savedChat === undefined) throw new Error('chatRepo.save not called');
    expect(savedChat.status).toBe('open');
    expect(savedChat.participants).toHaveLength(2);
    expect(savedPairKey).toBe(`organization:${ORG}|user:${USER}`);

    const [, savedMessage] = stubs.messageRepo.save.mock.calls[0] ?? [];
    if (savedMessage === undefined) throw new Error('messageRepo.save not called');
    expect(savedMessage.actorUserId).toBe(USER);
    expect(savedMessage.text).toBe('Hello');
  });

  it('reuses existing open chat: appends message, no second chat created', async () => {
    const stubs = makeStubs();
    const existing: ChatState = {
      chatId: CHAT,
      status: 'open',
      blockedByParticipantId: null,
      blockedAt: null,
      contextItemId: null,
      participants: [
        {
          id: PA,
          kind: 'user',
          subjectId: USER as string,
          assignedUserId: USER,
          claimedAt: null,
          createdAt: NOW,
        },
        {
          id: PB,
          kind: 'organization',
          subjectId: ORG as string,
          assignedUserId: null,
          claimedAt: null,
          createdAt: NOW,
        },
      ],
      lastMessage: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    stubs.chatRepo.findByPairKey.mockResolvedValueOnce(existing);
    stubs.clock.now = vi.fn(() => LATER);

    const interactor = makeInteractor(stubs);
    const result = await interactor.execute({
      initiatorUserId: USER,
      organizationId: ORG,
      contextItemId: null,
      message: { text: 'Hi again', mediaIds: [] },
    });

    expect(isRight(result)).toBe(true);
    if (!isRight(result)) return;
    expect(result.value.chatId).toBe(CHAT);
    expect(result.value.reused).toBe(true);

    expect(stubs.chatRepo.save).toHaveBeenCalledTimes(1);
    expect(stubs.messageRepo.save).toHaveBeenCalledTimes(1);
    expect(stubs.publisher.publish).toHaveBeenCalledTimes(1);
  });

  it('rejects with chat_blocked when chat is already blocked', async () => {
    const stubs = makeStubs();
    const blocked: ChatState = {
      chatId: CHAT,
      status: 'blocked',
      blockedByParticipantId: PB,
      blockedAt: NOW,
      contextItemId: null,
      participants: [
        {
          id: PA,
          kind: 'user',
          subjectId: USER as string,
          assignedUserId: USER,
          claimedAt: null,
          createdAt: NOW,
        },
        {
          id: PB,
          kind: 'organization',
          subjectId: ORG as string,
          assignedUserId: null,
          claimedAt: null,
          createdAt: NOW,
        },
      ],
      lastMessage: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    stubs.chatRepo.findByPairKey.mockResolvedValueOnce(blocked);

    const interactor = makeInteractor(stubs);
    const result = await interactor.execute({
      initiatorUserId: USER,
      organizationId: ORG,
      contextItemId: null,
      message: okMessage,
    });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('chat_blocked');
    }
  });

  it('rejects with organization_not_found when org is not published', async () => {
    const stubs = makeStubs();
    stubs.respondability.exists.mockResolvedValueOnce(false);

    const interactor = makeInteractor(stubs);
    const result = await interactor.execute({
      initiatorUserId: USER,
      organizationId: ORG,
      contextItemId: null,
      message: okMessage,
    });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('organization_not_found');
    }
    expect(stubs.chatRepo.save).not.toHaveBeenCalled();
  });

  it('propagates empty_message from domain', async () => {
    const stubs = makeStubs();
    const interactor = makeInteractor(stubs);

    const result = await interactor.execute({
      initiatorUserId: USER,
      organizationId: ORG,
      contextItemId: null,
      message: { text: null, mediaIds: [] },
    });

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('empty_message');
    }
  });
});
