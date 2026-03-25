export type OrganizationJsonState = {
  id: string;
  infoDraft: {
    name: string;
    description: string;
    avatarId: string | null;
    media: { type: string; mediaId: string }[];
    contacts?: { type: string; value: string; label?: string }[];
    team?: { title: string; members: { name: string; description?: string; media: { type: string; mediaId: string }[]; employeeUserId?: string }[] };
    status: string;
    updatedAt?: string;
  };
  infoPublication: {
    name: string;
    description: string;
    avatarId: string | null;
    media: { type: string; mediaId: string }[];
    contacts?: { type: string; value: string; label?: string }[];
    team?: { title: string; members: { name: string; description?: string; media: { type: string; mediaId: string }[]; employeeUserId?: string }[] };
    publishedAt: string;
  } | null;
  employees: {
    userId: string;
    roleId: string;
    isOwner: boolean;
    joinedAt: string;
  }[];
  roles: {
    id: string;
    name: string;
    permissions: string[];
  }[];
  subscription: {
    planId: string;
    maxEmployees: number;
    maxPublishedItems: number;
    availableWidgetTypes: string[];
  };
  claimToken: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ItemJsonState = {
  itemId: string;
  organizationId: string;
  typeId: string;
  draft: {
    widgets: unknown[];
    status: string;
    updatedAt: string;
  } | null;
  publication: {
    widgets: unknown[];
    publishedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};
