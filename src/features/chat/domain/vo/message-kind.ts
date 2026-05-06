export type MessageKind = 'text' | 'media' | 'system';

export type SystemEventType =
  | 'chat.closed'
  | 'chat.blocked'
  | 'chat.unblocked'
  | 'participant.claimed'
  | 'participant.released'
  | 'participant.reassigned';

export type SystemEvent = {
  type: SystemEventType;
  payload: Record<string, unknown>;
};
