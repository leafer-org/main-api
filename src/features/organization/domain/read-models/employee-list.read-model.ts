import type { EmployeeRoleId, UserId } from '@/kernel/domain/ids.js';

export type EmployeeListReadModel = {
  employees: {
    userId: UserId;
    roleId: EmployeeRoleId;
    roleName: string;
    isOwner: boolean;
    joinedAt: Date;
  }[];
};
