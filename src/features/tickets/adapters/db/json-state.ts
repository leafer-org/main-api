export type TicketJsonState = {
  ticketId: string;
  boardId: string;
  message: string;
  data: {
    item?: {
      id: string;
      organizationId: string;
      typeId: string;
      title: string;
      description: string;
      imageId: string | null;
      categoryIds: string[];
    };
    organization?: {
      id: string;
      name: string;
      description: string;
      avatarId: string | null;
    };
  };
  triggerId: string | null;
  eventId: string | null;
  status: string;
  assigneeId: string | null;
  history: {
    action: string;
    actorId: string;
    data: Record<string, unknown>;
    timestamp: string;
  }[];
  createdAt: string;
  updatedAt: string;
};

export type BoardJsonState = {
  boardId: string;
  name: string;
  description: string | null;
  scope: string;
  organizationId: string | null;
  subscriptions: {
    id: string;
    triggerId: string;
    filters: unknown[];
  }[];
  closeSubscriptions: {
    id: string;
    triggerId: string;
    filters: unknown[];
    addComment: boolean;
  }[];
  redirectSubscriptions: {
    id: string;
    triggerId: string;
    filters: unknown[];
    targetBoardId: string;
    addComment: boolean;
    commentTemplate: string;
  }[];
  manualCreation: boolean;
  allowedTransferBoardIds: string[];
  memberIds: string[];
  automations: {
    id: string;
    enabled: boolean;
    agentId: string;
    systemPrompt: string;
    onUncertain: {
      moveToBoardId: string | null;
    };
  }[];
  createdAt: string;
  updatedAt: string;
};
