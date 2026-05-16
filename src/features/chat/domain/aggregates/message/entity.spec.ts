import { describe, expect, it } from 'vitest';

import type { ChatMessageSentEvent } from '../chat/events.js';
import type { SystemEvent } from '../../vo/message-kind.js';
import {
  MESSAGE_DELETE_WINDOW_MS,
  MESSAGE_EDIT_WINDOW_MS,
  MessageEntity,
} from './entity.js';
import type { MessageState } from './state.js';
import { isLeft } from '@/infra/lib/box.js';
import {
  ChatId,
  ChatMessageId,
  ChatParticipantId,
  type MediaId,
  UserId,
} from '@/kernel/domain/ids.js';

const CHAT_ID = ChatId.raw('chat-1');
const MSG_ID = ChatMessageId.raw('msg-1');
const PARTICIPANT_ID = ChatParticipantId.raw('p-1');
const AUTHOR = UserId.raw('user-author');
const STRANGER = UserId.raw('user-stranger');
const NOW = new Date('2026-05-01T10:00:00.000Z');
const WITHIN_WINDOW = new Date(NOW.getTime() + MESSAGE_EDIT_WINDOW_MS - 1000);
const PAST_WINDOW = new Date(NOW.getTime() + MESSAGE_EDIT_WINDOW_MS + 1000);

function userMessage(overrides: Partial<MessageState> = {}): MessageState {
  return {
    messageId: MSG_ID,
    chatId: CHAT_ID,
    senderParticipantId: PARTICIPANT_ID,
    actorUserId: AUTHOR,
    kind: 'text',
    text: 'Hello',
    mediaIds: [],
    systemEvent: null,
    createdAt: NOW,
    editedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function systemMessage(): MessageState {
  return userMessage({
    senderParticipantId: null,
    actorUserId: null,
    kind: 'system',
    text: null,
    systemEvent: { type: 'chat.blocked', payload: {} },
  });
}

describe('MessageEntity.fromSentEvent', () => {
  it('hydrates state from sent event', () => {
    const event: ChatMessageSentEvent = {
      type: 'chat.message.sent',
      chatId: CHAT_ID,
      messageId: MSG_ID,
      senderParticipantId: PARTICIPANT_ID,
      kind: 'text',
      text: 'hi',
      mediaIds: [],
      systemEvent: null,
      createdAt: NOW,
    };
    const state = MessageEntity.fromSentEvent(event, AUTHOR);
    expect(state.messageId).toBe(MSG_ID);
    expect(state.actorUserId).toBe(AUTHOR);
    expect(state.editedAt).toBeNull();
    expect(state.deletedAt).toBeNull();
  });

  it('hydrates system message with null actorUserId', () => {
    const sysEvent: SystemEvent = { type: 'chat.blocked', payload: {} };
    const event: ChatMessageSentEvent = {
      type: 'chat.message.sent',
      chatId: CHAT_ID,
      messageId: MSG_ID,
      senderParticipantId: null,
      kind: 'system',
      text: null,
      mediaIds: [],
      systemEvent: sysEvent,
      createdAt: NOW,
    };
    const state = MessageEntity.fromSentEvent(event, null);
    expect(state.kind).toBe('system');
    expect(state.systemEvent).toEqual(sysEvent);
    expect(state.actorUserId).toBeNull();
  });
});

describe('MessageEntity.edit', () => {
  it('edits own text message within window', () => {
    const state = userMessage();
    const result = MessageEntity.edit(state, {
      type: 'EditMessage',
      actorUserId: AUTHOR,
      text: 'Edited',
      mediaIds: [],
      now: WITHIN_WINDOW,
    });
    expect(isLeft(result)).toBe(false);
    if (isLeft(result)) return;
    expect(result.value.state.text).toBe('Edited');
    expect(result.value.state.editedAt).toEqual(WITHIN_WINDOW);
    expect(result.value.events[0].type).toBe('chat.message.edited');
  });

  it('switches kind to media when text becomes empty after edit', () => {
    const state = userMessage();
    const result = MessageEntity.edit(state, {
      type: 'EditMessage',
      actorUserId: AUTHOR,
      text: null,
      mediaIds: ['m-1' as MediaId],
      now: WITHIN_WINDOW,
    });
    expect(isLeft(result)).toBe(false);
    if (isLeft(result)) return;
    expect(result.value.state.kind).toBe('media');
  });

  it('rejects edit by non-author', () => {
    const state = userMessage();
    const result = MessageEntity.edit(state, {
      type: 'EditMessage',
      actorUserId: STRANGER,
      text: 'no',
      mediaIds: [],
      now: WITHIN_WINDOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('not_message_author');
    }
  });

  it('rejects edit of system message', () => {
    const result = MessageEntity.edit(systemMessage(), {
      type: 'EditMessage',
      actorUserId: AUTHOR,
      text: 'no',
      mediaIds: [],
      now: WITHIN_WINDOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('cannot_modify_system_message');
    }
  });

  it('rejects edit of deleted message', () => {
    const state = userMessage({ deletedAt: NOW, text: null, mediaIds: [] });
    const result = MessageEntity.edit(state, {
      type: 'EditMessage',
      actorUserId: AUTHOR,
      text: 'no',
      mediaIds: [],
      now: WITHIN_WINDOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('message_deleted');
    }
  });

  it('rejects edit after window expired', () => {
    const state = userMessage();
    const result = MessageEntity.edit(state, {
      type: 'EditMessage',
      actorUserId: AUTHOR,
      text: 'too late',
      mediaIds: [],
      now: PAST_WINDOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('edit_window_expired');
    }
  });

  it('rejects edit producing empty content', () => {
    const result = MessageEntity.edit(userMessage(), {
      type: 'EditMessage',
      actorUserId: AUTHOR,
      text: '   ',
      mediaIds: [],
      now: WITHIN_WINDOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('empty_message');
    }
  });

  it('rejects edit producing too-long text', () => {
    const longText = 'a'.repeat(4001);
    const result = MessageEntity.edit(userMessage(), {
      type: 'EditMessage',
      actorUserId: AUTHOR,
      text: longText,
      mediaIds: [],
      now: WITHIN_WINDOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('message_text_too_long');
    }
  });
});

describe('MessageEntity.delete', () => {
  it('soft-deletes own message within window', () => {
    const result = MessageEntity.delete(userMessage(), {
      type: 'DeleteMessage',
      actorUserId: AUTHOR,
      now: WITHIN_WINDOW,
    });
    expect(isLeft(result)).toBe(false);
    if (isLeft(result)) return;
    expect(result.value.state.deletedAt).toEqual(WITHIN_WINDOW);
    expect(result.value.state.text).toBeNull();
    expect(result.value.state.mediaIds).toHaveLength(0);
    expect(result.value.events[0].type).toBe('chat.message.deleted');
  });

  it('rejects delete by non-author', () => {
    const result = MessageEntity.delete(userMessage(), {
      type: 'DeleteMessage',
      actorUserId: STRANGER,
      now: WITHIN_WINDOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('not_message_author');
    }
  });

  it('rejects double delete', () => {
    const state = userMessage({ deletedAt: NOW, text: null, mediaIds: [] });
    const result = MessageEntity.delete(state, {
      type: 'DeleteMessage',
      actorUserId: AUTHOR,
      now: WITHIN_WINDOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('message_already_deleted');
    }
  });

  it('rejects delete of system message', () => {
    const result = MessageEntity.delete(systemMessage(), {
      type: 'DeleteMessage',
      actorUserId: AUTHOR,
      now: WITHIN_WINDOW,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('cannot_modify_system_message');
    }
  });

  it('rejects delete after window expired', () => {
    const past = new Date(NOW.getTime() + MESSAGE_DELETE_WINDOW_MS + 1000);
    const result = MessageEntity.delete(userMessage(), {
      type: 'DeleteMessage',
      actorUserId: AUTHOR,
      now: past,
    });
    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.error.type).toBe('delete_window_expired');
    }
  });
});
