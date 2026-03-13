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
      imageUrl: string | null;
      categoryIds: string[];
    };
    organization?: {
      id: string;
      name: string;
      description: string;
      avatarUrl: string | null;
    };
  };
  triggerId: string | null;
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
