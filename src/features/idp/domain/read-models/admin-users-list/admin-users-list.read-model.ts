export type AdminUsersListReadModel = {
  userId: string;
  phoneNumber: string;
  fullName: string;
  role: string;
  blockedAt: string | null;
  blockReason: string | null;
  createdAt: string;
  updatedAt: string;
};
