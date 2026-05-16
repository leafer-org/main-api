import type {
  ChatListItem,
  ChatParticipantSubjectDto,
  UserRefDto,
} from '../../application/ports.js';

export function serializeUserRef(ref: UserRefDto | null) {
  if (!ref) return null;
  return {
    kind: ref.kind,
    id: ref.id as string,
    fullName: ref.fullName,
    avatarUrl: ref.avatarUrl,
  };
}

export function serializeSubject(subject: ChatParticipantSubjectDto | null) {
  if (!subject) return null;
  if (subject.kind === 'user') {
    return {
      kind: subject.kind,
      id: subject.id as string,
      fullName: subject.fullName,
      avatarUrl: subject.avatarUrl,
    };
  }
  return {
    kind: subject.kind,
    id: subject.id as string,
    name: subject.name,
    logoUrl: subject.logoUrl,
  };
}

export function serializeChat(chat: ChatListItem) {
  return {
    chatId: chat.chatId as string,
    status: chat.status,
    participants: chat.participants.map((p) => ({
      id: p.id as string,
      subject: serializeSubject(p.subject),
      assignedUser: serializeUserRef(p.assignedUser),
    })),
    contextItemId: chat.contextItemId,
    lastMessage:
      chat.lastMessage === null
        ? null
        : {
            messageId: chat.lastMessage.messageId as string,
            preview: chat.lastMessage.preview,
            senderParticipantId:
              chat.lastMessage.senderParticipantId === null
                ? null
                : (chat.lastMessage.senderParticipantId as string),
            senderUser: serializeUserRef(chat.lastMessage.senderUser),
            createdAt: chat.lastMessage.createdAt.toISOString(),
          },
    myUnreadCount: chat.myUnreadCount,
    updatedAt: chat.updatedAt.toISOString(),
  };
}
