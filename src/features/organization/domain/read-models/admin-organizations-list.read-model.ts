export type AdminOrganizationsListReadModel = {
  organizationId: string;
  name: string;
  description: string;
  infoDraftStatus: string;
  hasPublication: boolean;
  employeeCount: number;
  planId: string;
  isClaimed: boolean;
  createdAt: string;
  updatedAt: string;
};
