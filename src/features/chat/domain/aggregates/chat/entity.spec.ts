import { describe, expect, it } from 'vitest';

import { ChatEntity, MESSAGE_MEDIA_MAX_COUNT, MESSAGE_TEXT_MAX_LENGTH } from './entity.js';
import type { NewMessageSpec, NewParticipantSpec, OpenChatCommand } from './commands.js';
import type { ChatState } from './state.js';
import { isLeft } from '@/infra/lib/box.js';
import {
  ChatId,
  ChatMessageId,
  ChatParticipantId,
  type MediaId,
  OrganizationId,
  UserId,
} from '@/kernel/domain/ids.js';

const CHAT_ID = ChatId.raw('chat-1');
const PA = ChatParticipantId.raw('pa');
const PB = ChatParticipantId.raw('pb');
const MSG_1 = ChatMessageId.raw('msg-1');
const MSG_2 = ChatMessageId.raw('msg-2');
const USER_1 = UserId.raw('user-1');
const ORG_1 = OrganizationId.raw('org-1');
const EMPLOYEE_1 = UserId.raw('emp-1');
const SYS_MSG_1 = ChatMessageId.raw('sys-1');
const NOW = new Date('2026-05-01T10:00:00.000Z');
const LATER = new Date('2026-05-01T10:05:00.000Z');
const EMPLOYEE_2 = UserId.raw('emp-2');

const userSlot: NewParticipantSpec = {
  id: PA,
  kind: 'user',
  subjectId: USER_1 as string,
  assignedUserId: USER_1,
};

const orgSlotUnclaimed: NewParticipantSpec = {
  id: PB,
  kind: 'organization',
  subjectId: ORG_1 as string,
  assignedUserId: null,
};

const supportSlotUnclaimed: NewParticipantSpec = {
  id: PB,
  kind: 'support',
  subjectId: null,
  assignedUserId: null,
};

const firstMessage = (overrides: Partial<NewMessageSpec> = {}): NewMessageSpec => ({
  messageId: MSG_1,
  senderParticipantId: PA,
  kind: 'text',
  text: 'Hello',
  mediaIds: [],
  ...overrides,
});

function openUserToOrg(): ChatState {
  const result = ChatEntity.open({
    type: 'OpenChat',
    chatId: CHAT_ID,
    participants: [userSlot, orgSlotUnclaimed],
    contextItemId: null,
    firstMessage: firstMessage(),
    now: NOW,
  });
  if (isLeft(result)) throw new Error(`Expected Right, got ${result.error.type}`);
  return result.value.state;
}

function openClaimed(): ChatState {
  const claimed = ChatEntity.claimSlot(openUserToOrg(), {
    type: 'ClaimSlot',
    participantId: PB,
    userId: EMPLOYEE_1,
    systemMessageId: SYS_MSG_1,
    now: LATER,
  });
  if (isLeft(claimed)) throw new Error(`Expected claim Right, got ${claimed.error.type}`);
  return claimed.value.state;
}

describe('ChatEntity.open', () => {
  it('opens user→organization chat with first message and emits 2 events', () => {
    const result = ChatEntity.open({
      type: 'OpenChat',
      chatId: CHAT_ID,
      participants: [userSlot, orgSlotUnclaimed],
      contextItemId: null,
      firstMessage: firstMessage(),
      now: NOW,
    });

    expect(isLeft(result)).toBe(false);
    if (isLeft(result)) return;

    const { state, events } = result.value;
    expect(state.chatId).toBe(CHAT_ID);
    expect(state.status).toBe('open');
    expect(state.participants).toHaveLength(2);
    const [first, second] = state.participants;
    expect(first?.kind).toBe('user');
    expect(first?.assignedUserId).toBe(USER_1);
    expect(second?.kind).toBe('organization');
    expect(second?.assignedUserId).toBeNull();
    expect(state.lastMessage?.messageId).toBe(MSG_1);
    expect(state.lastMessage?.preview).toBe('Hello');

    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('chat.opened');
    expect(events[1]?.type).toBe('chat.message.sent');
  });

  it('opens user→support chat (subjectId of support is null)', () => {
    const result = ChatEntity.open({
      type: 'OpenChat',
      chatId: CHAT_ID,
      participants: [userSlot, supportSlotUnclaimed],
      contextItemId: null,
      firstMessage: firstMessage(),
      now: NOW,
    });

    expect(isLeft(result)).toBe(false);
  });

  it('rejects pair user+user (forbidden)', () => {
    const userSlotB: NewParticipantSpec = {
      id: PB,
      kind: 'user',
      subjectId: 'user-2',
      assignedUserId: UserId.raw('user-2'),
    };
    const result = ChatEntity.open({
      type: 'OpenChat',
      chatId: CHAT_ID,
      participants: [userSlot, userSlotB],
      contextItemId: null,
      firstMessage: firstMessage(),
      now: NOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('forbidden_pair');
    }
  });

  it('rejects organization initiator', () => {
    const orgClaimedAsInitiator: NewParticipantSpec = {
      id: PA,
      kind: 'organization',
      subjectId: ORG_1 as string,
      assignedUserId: EMPLOYEE_1,
    };
    const userResponder: NewParticipantSpec = {
      id: PB,
      kind: 'user',
      subjectId: USER_1 as string,
      assignedUserId: USER_1,
    };
    const result = ChatEntity.open({
      type: 'OpenChat',
      chatId: CHAT_ID,
      participants: [orgClaimedAsInitiator, userResponder],
      contextItemId: null,
      firstMessage: firstMessage({ senderParticipantId: PA }),
      now: NOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('organization_cannot_initiate');
    }
  });

  it('rejects when participants count is not 2', () => {
    const result = ChatEntity.open({
      type: 'OpenChat',
      chatId: CHAT_ID,
      participants: [userSlot],
      contextItemId: null,
      firstMessage: firstMessage(),
      now: NOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('invalid_participants');
    }
  });

  it('rejects user slot without subjectId', () => {
    const badUser: NewParticipantSpec = {
      id: PA,
      kind: 'user',
      subjectId: null,
      assignedUserId: USER_1,
    };
    const result = ChatEntity.open({
      type: 'OpenChat',
      chatId: CHAT_ID,
      participants: [badUser, orgSlotUnclaimed],
      contextItemId: null,
      firstMessage: firstMessage(),
      now: NOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('invalid_participants');
    }
  });

  it('rejects support slot with non-null subjectId', () => {
    const badSupport: NewParticipantSpec = {
      id: PB,
      kind: 'support',
      subjectId: 'something',
      assignedUserId: null,
    };
    const result = ChatEntity.open({
      type: 'OpenChat',
      chatId: CHAT_ID,
      participants: [userSlot, badSupport],
      contextItemId: null,
      firstMessage: firstMessage(),
      now: NOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('invalid_participants');
    }
  });

  it('rejects sender not in chat', () => {
    const stranger = ChatParticipantId.raw('px');
    const result = ChatEntity.open({
      type: 'OpenChat',
      chatId: CHAT_ID,
      participants: [userSlot, orgSlotUnclaimed],
      contextItemId: null,
      firstMessage: firstMessage({ senderParticipantId: stranger }),
      now: NOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('sender_not_in_chat');
    }
  });

  it('rejects empty message', () => {
    const result = ChatEntity.open({
      type: 'OpenChat',
      chatId: CHAT_ID,
      participants: [userSlot, orgSlotUnclaimed],
      contextItemId: null,
      firstMessage: firstMessage({ text: null, mediaIds: [] }),
      now: NOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('empty_message');
    }
  });

  it('rejects text exceeding max length', () => {
    const longText = 'a'.repeat(MESSAGE_TEXT_MAX_LENGTH + 1);
    const result = ChatEntity.open({
      type: 'OpenChat',
      chatId: CHAT_ID,
      participants: [userSlot, orgSlotUnclaimed],
      contextItemId: null,
      firstMessage: firstMessage({ text: longText }),
      now: NOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('message_text_too_long');
    }
  });

  it('rejects too many media', () => {
    const mediaIds = Array.from(
      { length: MESSAGE_MEDIA_MAX_COUNT + 1 },
      (_, i) => `m-${i}` as MediaId,
    );
    const result = ChatEntity.open({
      type: 'OpenChat',
      chatId: CHAT_ID,
      participants: [userSlot, orgSlotUnclaimed],
      contextItemId: null,
      firstMessage: firstMessage({ text: null, mediaIds }),
      now: NOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('message_too_many_media');
    }
  });

  it('media-only message — kind=media accepted', () => {
    const result = ChatEntity.open({
      type: 'OpenChat',
      chatId: CHAT_ID,
      participants: [userSlot, orgSlotUnclaimed],
      contextItemId: null,
      firstMessage: firstMessage({ kind: 'media', text: null, mediaIds: ['m1' as MediaId] }),
      now: NOW,
    });
    expect(isLeft(result)).toBe(false);
    if (isLeft(result)) return;
    expect(result.value.state.lastMessage?.preview).toBe('[media]');
  });
});

describe('ChatEntity.sendMessage', () => {
  it('user sends second message in open chat', () => {
    const state = openUserToOrg();
    const result = ChatEntity.sendMessage(state, {
      type: 'SendMessage',
      message: {
        messageId: MSG_2,
        senderParticipantId: PA,
        kind: 'text',
        text: 'Second',
        mediaIds: [],
      },
      now: LATER,
    });
    expect(isLeft(result)).toBe(false);
    if (isLeft(result)) return;
    expect(result.value.events).toHaveLength(1);
    expect(result.value.events[0]?.type).toBe('chat.message.sent');
    expect(result.value.state.lastMessage?.messageId).toBe(MSG_2);
    expect(result.value.state.updatedAt).toEqual(LATER);
  });

  it('rejects send from organization slot when assignedUserId is null (claim required)', () => {
    const state = openUserToOrg();
    const result = ChatEntity.sendMessage(state, {
      type: 'SendMessage',
      message: {
        messageId: MSG_2,
        senderParticipantId: PB,
        kind: 'text',
        text: 'reply',
        mediaIds: [],
      },
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('claim_required');
    }
  });

  it('allows send from organization slot once claimed', () => {
    const orgClaimed: NewParticipantSpec = {
      id: PB,
      kind: 'organization',
      subjectId: ORG_1 as string,
      assignedUserId: EMPLOYEE_1,
    };
    const opened = ChatEntity.open({
      type: 'OpenChat',
      chatId: CHAT_ID,
      participants: [userSlot, orgClaimed],
      contextItemId: null,
      firstMessage: firstMessage(),
      now: NOW,
    });
    if (isLeft(opened)) throw new Error('open failed');

    const result = ChatEntity.sendMessage(opened.value.state, {
      type: 'SendMessage',
      message: {
        messageId: MSG_2,
        senderParticipantId: PB,
        kind: 'text',
        text: 'reply from employee',
        mediaIds: [],
      },
      now: LATER,
    });
    expect(isLeft(result)).toBe(false);
  });

  it('rejects sender not in chat', () => {
    const state = openUserToOrg();
    const stranger = ChatParticipantId.raw('px');
    const result = ChatEntity.sendMessage(state, {
      type: 'SendMessage',
      message: {
        messageId: MSG_2,
        senderParticipantId: stranger,
        kind: 'text',
        text: 'hi',
        mediaIds: [],
      },
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('sender_not_in_chat');
    }
  });

  it('rejects user-side send when chat is blocked', () => {
    const state = openUserToOrg();
    const blocked: ChatState = {
      ...state,
      status: 'blocked',
      blockedByParticipantId: PB,
      blockedAt: LATER,
    };
    const result = ChatEntity.sendMessage(blocked, {
      type: 'SendMessage',
      message: {
        messageId: MSG_2,
        senderParticipantId: PA,
        kind: 'text',
        text: 'will fail',
        mediaIds: [],
      },
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('chat_blocked');
    }
  });

  it('auto-reopens closed chat on send (emits reopened + sent events)', () => {
    const state = openUserToOrg();
    const closed: ChatState = { ...state, status: 'closed' };
    const result = ChatEntity.sendMessage(closed, {
      type: 'SendMessage',
      message: {
        messageId: MSG_2,
        senderParticipantId: PA,
        kind: 'text',
        text: 'back',
        mediaIds: [],
      },
      now: LATER,
    });
    expect(isLeft(result)).toBe(false);
    if (isLeft(result)) return;
    expect(result.value.state.status).toBe('open');
    expect(result.value.events).toHaveLength(2);
    expect(result.value.events[0]?.type).toBe('chat.reopened');
    expect(result.value.events[1]?.type).toBe('chat.message.sent');
  });
});

describe('ChatEntity.claimSlot', () => {
  it('claims unclaimed organization slot and emits slot.claimed + system message', () => {
    const state = openUserToOrg();
    const result = ChatEntity.claimSlot(state, {
      type: 'ClaimSlot',
      participantId: PB,
      userId: EMPLOYEE_1,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(false);
    if (isLeft(result)) return;

    const orgSlot = result.value.state.participants.find((p) => p.kind === 'organization');
    expect(orgSlot?.assignedUserId).toBe(EMPLOYEE_1);
    expect(orgSlot?.claimedAt).toEqual(LATER);

    expect(result.value.events).toHaveLength(2);
    expect(result.value.events[0].type).toBe('chat.slot.claimed');
    expect(result.value.events[1].type).toBe('chat.message.sent');
    expect(result.value.events[1].kind).toBe('system');
    expect(result.value.events[1].systemEvent?.type).toBe('participant.claimed');
    expect(result.value.state.lastMessage?.messageId).toBe(SYS_MSG_1);
  });

  it('rejects claiming already-claimed slot', () => {
    const state = openClaimed();
    const result = ChatEntity.claimSlot(state, {
      type: 'ClaimSlot',
      participantId: PB,
      userId: EMPLOYEE_2,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('slot_already_claimed');
    }
  });

  it('rejects claiming user slot', () => {
    const state = openUserToOrg();
    const result = ChatEntity.claimSlot(state, {
      type: 'ClaimSlot',
      participantId: PA,
      userId: EMPLOYEE_1,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('slot_not_claimable');
    }
  });

  it('rejects claim in closed chat', () => {
    const state: ChatState = { ...openUserToOrg(), status: 'closed' };
    const result = ChatEntity.claimSlot(state, {
      type: 'ClaimSlot',
      participantId: PB,
      userId: EMPLOYEE_1,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('chat_not_open');
    }
  });

  it('rejects claim of non-existent participant', () => {
    const state = openUserToOrg();
    const result = ChatEntity.claimSlot(state, {
      type: 'ClaimSlot',
      participantId: ChatParticipantId.raw('px'),
      userId: EMPLOYEE_1,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('participant_not_found');
    }
  });
});

describe('ChatEntity.releaseSlot', () => {
  it('releases claimed slot back to pool', () => {
    const state = openClaimed();
    const result = ChatEntity.releaseSlot(state, {
      type: 'ReleaseSlot',
      participantId: PB,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(false);
    if (isLeft(result)) return;

    const orgSlot = result.value.state.participants.find((p) => p.kind === 'organization');
    expect(orgSlot?.assignedUserId).toBeNull();
    expect(orgSlot?.claimedAt).toBeNull();
    expect(result.value.events[0].type).toBe('chat.slot.released');
    expect(result.value.events[1].systemEvent?.type).toBe('participant.released');
  });

  it('rejects release of unclaimed slot', () => {
    const state = openUserToOrg();
    const result = ChatEntity.releaseSlot(state, {
      type: 'ReleaseSlot',
      participantId: PB,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('slot_not_claimed');
    }
  });

  it('rejects release of user slot', () => {
    const state = openUserToOrg();
    const result = ChatEntity.releaseSlot(state, {
      type: 'ReleaseSlot',
      participantId: PA,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('slot_not_claimable');
    }
  });
});

describe('ChatEntity.reassignSlot', () => {
  it('reassigns claimed slot to another user', () => {
    const state = openClaimed();
    const result = ChatEntity.reassignSlot(state, {
      type: 'ReassignSlot',
      participantId: PB,
      newAssigneeUserId: EMPLOYEE_2,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(false);
    if (isLeft(result)) return;

    const orgSlot = result.value.state.participants.find((p) => p.kind === 'organization');
    expect(orgSlot?.assignedUserId).toBe(EMPLOYEE_2);
    expect(result.value.events[0].type).toBe('chat.slot.reassigned');
    expect(result.value.events[0].oldAssigneeUserId).toBe(EMPLOYEE_1);
    expect(result.value.events[0].newAssigneeUserId).toBe(EMPLOYEE_2);
  });

  it('rejects reassign of unclaimed slot', () => {
    const state = openUserToOrg();
    const result = ChatEntity.reassignSlot(state, {
      type: 'ReassignSlot',
      participantId: PB,
      newAssigneeUserId: EMPLOYEE_1,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('slot_not_claimed');
    }
  });
});

describe('ChatEntity.blockChat', () => {
  it('blocks chat from operator side, sets blockedBy/blockedAt', () => {
    const state = openClaimed();
    const result = ChatEntity.blockChat(state, {
      type: 'BlockChat',
      byParticipantId: PB,
      reason: 'spam',
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(false);
    if (isLeft(result)) return;
    expect(result.value.state.status).toBe('blocked');
    expect(result.value.state.blockedByParticipantId).toBe(PB);
    expect(result.value.state.blockedAt).toEqual(LATER);
    expect(result.value.events[0].type).toBe('chat.blocked');
    expect(result.value.events[0].reason).toBe('spam');
  });

  it('rejects block from user side', () => {
    const state = openClaimed();
    const result = ChatEntity.blockChat(state, {
      type: 'BlockChat',
      byParticipantId: PA,
      reason: null,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('cannot_act_as_user');
    }
  });

  it('rejects block when operator slot is not claimed', () => {
    const state = openUserToOrg();
    const result = ChatEntity.blockChat(state, {
      type: 'BlockChat',
      byParticipantId: PB,
      reason: null,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('claim_required');
    }
  });

  it('rejects block on closed chat', () => {
    const state: ChatState = { ...openClaimed(), status: 'closed' };
    const result = ChatEntity.blockChat(state, {
      type: 'BlockChat',
      byParticipantId: PB,
      reason: null,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('chat_not_open');
    }
  });
});

describe('ChatEntity.unblockChat', () => {
  function blocked(): ChatState {
    const r = ChatEntity.blockChat(openClaimed(), {
      type: 'BlockChat',
      byParticipantId: PB,
      reason: null,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    if (isLeft(r)) throw new Error('block failed');
    return r.value.state;
  }

  it('unblocks blocked chat', () => {
    const result = ChatEntity.unblockChat(blocked(), {
      type: 'UnblockChat',
      byParticipantId: PB,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(false);
    if (isLeft(result)) return;
    expect(result.value.state.status).toBe('open');
    expect(result.value.state.blockedByParticipantId).toBeNull();
    expect(result.value.state.blockedAt).toBeNull();
    expect(result.value.events[0].type).toBe('chat.unblocked');
  });

  it('rejects unblock of non-blocked chat', () => {
    const result = ChatEntity.unblockChat(openClaimed(), {
      type: 'UnblockChat',
      byParticipantId: PB,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('chat_not_blocked');
    }
  });
});

describe('ChatEntity.closeChat', () => {
  it('closes open chat from operator side', () => {
    const result = ChatEntity.closeChat(openClaimed(), {
      type: 'CloseChat',
      byParticipantId: PB,
      reason: 'resolved',
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(false);
    if (isLeft(result)) return;
    expect(result.value.state.status).toBe('closed');
    expect(result.value.events[0].type).toBe('chat.closed');
    expect(result.value.events[0].reason).toBe('resolved');
  });

  it('rejects close from user side', () => {
    const result = ChatEntity.closeChat(openClaimed(), {
      type: 'CloseChat',
      byParticipantId: PA,
      reason: null,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('cannot_act_as_user');
    }
  });

  it('rejects close on already-closed chat', () => {
    const state: ChatState = { ...openClaimed(), status: 'closed' };
    const result = ChatEntity.closeChat(state, {
      type: 'CloseChat',
      byParticipantId: PB,
      reason: null,
      systemMessageId: SYS_MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('chat_not_open');
    }
  });
});

describe('ChatEntity.markRead', () => {
  it('moves lastReadMessageId on participant', () => {
    const state = openClaimed();
    const result = ChatEntity.markRead(state, {
      type: 'MarkRead',
      participantId: PA,
      upToMessageId: MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(false);
    if (isLeft(result)) return;

    const userSlotState = result.value.state.participants.find((p) => p.kind === 'user');
    expect(userSlotState?.lastReadMessageId).toBe(MSG_1);
    expect(result.value.events).toHaveLength(1);
    expect(result.value.events[0].type).toBe('chat.read');
  });

  it('rejects markRead for non-existent participant', () => {
    const state = openClaimed();
    const result = ChatEntity.markRead(state, {
      type: 'MarkRead',
      participantId: ChatParticipantId.raw('px'),
      upToMessageId: MSG_1,
      now: LATER,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('participant_not_found');
    }
  });
});
