import type { CategoryId, ItemId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';

export type TicketItemData = {
  id: ItemId;
  organizationId: OrganizationId;
  typeId: TypeId;
  title: string;
  description: string;
  imageUrl: string | null;
  categoryIds: CategoryId[];
};

export type TicketOrganizationData = {
  id: OrganizationId;
  name: string;
  description: string;
  avatarUrl: string | null;
};

export type TicketData = {
  item?: TicketItemData;
  organization?: TicketOrganizationData;
};
